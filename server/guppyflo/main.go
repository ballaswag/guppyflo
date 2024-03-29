package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"io/ioutil"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"sort"
	"sync"
	"time"

	"github.com/NYTimes/gziphandler"

	"golang.ngrok.com/ngrok"
	"golang.ngrok.com/ngrok/config"

	ngrokclient "github.com/ngrok/ngrok-api-go/v5"
	ngrokclientCredentials "github.com/ngrok/ngrok-api-go/v5/credentials"

	"tailscale.com/tsnet"
)

type PrinterStats struct {
	Filename      string  `json:"filename"`
	State         string  `json:"state"`
	TotalDuration float64 `json:"total_duration"`
	PrintDuration float64 `json:"print_duration"`
	Filamentused  float64 `json:"filament_used"`
	Message       string  `json:"message"`
	Info          struct {
		TotalLayer   *string `json:"total_layer"`
		CurrentLayer *string `json:"current_layer"`
	} `json:"info"`
}

type VirtualSDCard struct {
	FilePath     *string `json:"file_path"`
	Progress     float64 `json:"progress"`
	Active       bool    `json:"is_active"`
	FilePosition int     `json:"file_position"`
	FileSize     int     `json:"file_size"`
}

type ExtruderStats struct {
	Temperature float64 `json:"temperature"`
	Target      float64 `json:"target"`
}

type HeaterBedStats struct {
	Temperature float64 `json:"temperature"`
	Target      float64 `json:"target"`
}

type MoonrakerPrinterStats struct {
	Result struct {
		Status struct {
			Stats     PrinterStats   `json:"print_stats"`
			SDCard    VirtualSDCard  `json:"virtual_sdcard"`
			Extruder  ExtruderStats  `json:"extruder,omitempty"`
			HeaterBed HeaterBedStats `json:"heater_bed,omitempty"`
		}
		EventTime float64 `json:"eventtime"`
	} `json:"result"`
}

type PrinterInfoStatsPair struct {
	PrinterId   string          `json:"id"`
	PrinterInfo GTPrinterConfig `json:"printer"`
	Stats       PrinterStats    `json:"stats"`
	SDCard      VirtualSDCard   `json:"virtual_sdcard"`
	Extruder    ExtruderStats   `json:"extruder,omitempty"`
	HeaterBed   HeaterBedStats  `json:"heater_bed,omitempty"`
}

type GTPrinterCamerasConfig struct {
	Id         string `json:"id,omitempty"`
	Path       string `json:"path"`
	CameraIp   string `json:"camera_ip"`
	CameraPort int    `json:"camera_port"`
	Type       string `json:"type"`
}

type GTPrinterConfig struct {
	Name          string                   `json:"printer_name"`
	MoonrakerIP   string                   `json:"moonraker_ip"`
	MoonrakerPort int                      `json:"moonraker_port"`
	Cameras       []GTPrinterCamerasConfig `json:"cameras"`
}

type GTOAuthConfig struct {
	Provider    string   `json:"provider"`
	OAuthEmails []string `json:"oauth_emails"`
}

type GTConfig struct {
	Printers []GTPrinterConfig `json:"printers,omitempty"`
	// Fluidd *string `json:"fluidd"`
	// Mainsail *string `json:"mainsail"`
	NgrokApiKey    *string         `json:"ngrok_api_key,omitempty"`
	NgrokAuthToken *string         `json:"ngrok_auth_token,omitempty"`
	OAuthConfig    []GTOAuthConfig `json:"oauth_config,omitempty"`
	GuppyFloPort   int             `json:"guppyflo_local_port"`
}

type GTUISettings struct {
	NgrokApiKey        string `json:"ngrok_api_key"`
	NgrokAuthToken     string `json:"ngrok_auth_token"`
	NgrokOAuthProvider string `json:"ngrok_oauth_provider"`
	NgrokOAuthEmail    string `json:"ngrok_oauth_email"`
	GuppyFloPort       int    `json:"guppyflo_local_port"`
	TSAuthURL          string `json:"ts_auth_url,omitempty"`
}

type Pair[T, U any] struct {
	First  T
	Second U
}

func loadGTConfig(file string) GTConfig {
	var config GTConfig
	cf, err := os.Open(file)
	defer cf.Close()
	if err != nil {
		// log.Fatal(err.Error())

		defaultConfig := GTConfig{
			GuppyFloPort: 9873,
		}
		saveGTConfig(defaultConfig)
		return defaultConfig
	}
	jsonParser := json.NewDecoder(cf)
	jsonParser.Decode(&config)
	return config
}

func saveGTConfig(c GTConfig) {
	content, err := json.Marshal(c)
	if err != nil {
		fmt.Println(err)
	}
	err = ioutil.WriteFile("guppytunnel.json", content, 0644)
	if err != nil {
		log.Fatal(err)
	}
}

func gtConfigDeletePrinter(ip string, port int) {
	GTConfigLock.Lock()
	defer GTConfigLock.Unlock()
	n := 0
	for _, x := range gtconfig.Printers {
		if x.MoonrakerIP != ip || x.MoonrakerPort != port {
			gtconfig.Printers[n] = x
			n++
		}
	}
	gtconfig.Printers = gtconfig.Printers[:n]
	saveGTConfig(gtconfig)
}

func createNgrokToken(ctx context.Context, ngrokKey string) (*string, error) {
	clientConfig := ngrokclient.NewClientConfig(ngrokKey)
	creds := ngrokclientCredentials.NewClient(clientConfig)
	token, err := creds.Create(ctx, &ngrokclient.CredentialCreate{})
	if err != nil {
		return nil, err
	}

	return token.Token, nil
}

var (
	Printers            map[string]PrinterInfoStatsPair
	PrinterQuitChannels map[string]chan bool
	PrintersMapLock     sync.RWMutex

	TSAuthURL    string
	gtconfig     = loadGTConfig("guppytunnel.json")
	GTConfigLock sync.RWMutex

	c      = make(chan Pair[PrinterInfoStatsPair, chan bool])
	client = http.Client{Timeout: 3 * time.Second}
)

func main() {
	LOG_FILE := "guppyflo.log"

	logFile, err := os.OpenFile(LOG_FILE, os.O_APPEND|os.O_RDWR|os.O_CREATE, 0644)
	if err != nil {
		log.Panic(err)
	}
	defer logFile.Close()
	log.SetOutput(logFile)

	if err := run(context.Background()); err != nil {
		log.Fatal(err)
	}
}

func run(ctx context.Context) error {

	// log.Println("config:", gtconfig)
	Printers = make(map[string]PrinterInfoStatsPair)
	PrinterQuitChannels = make(map[string]chan bool)

	startPrinterPoller(gtconfig.Printers)
	startPrinterDataConsumer()

	enableNgrok := (gtconfig.NgrokApiKey != nil || gtconfig.NgrokAuthToken != nil) && len(gtconfig.OAuthConfig) > 0

	if gtconfig.NgrokApiKey == nil {
		log.Println("Ngrok API Key is missing. Please add your Ngrok API Key to the configure file for remote tunneling.")
	}

	if gtconfig.NgrokAuthToken == nil && gtconfig.NgrokApiKey != nil {
		token, err := createNgrokToken(ctx, *gtconfig.NgrokApiKey)
		if err != nil {
			return err
		}
		gtconfig.NgrokAuthToken = token
		log.Println("Created auth token")
		saveGTConfig(gtconfig)
	}

	if (gtconfig.NgrokAuthToken != nil || gtconfig.NgrokApiKey != nil) && len(gtconfig.OAuthConfig) == 0 {
		return errors.New("Must configure at least one OAuth Provider when Ngrok is enabled.")
	}

	// populate printers
	PrintersMapLock.Lock()
	for _, p := range gtconfig.Printers {
		printerId := fmt.Sprintf("printer-%d", hash(fmt.Sprintf("%s:%d", p.MoonrakerIP, p.MoonrakerPort)))
		Printers[printerId] = PrinterInfoStatsPair{
			PrinterId:   printerId,
			PrinterInfo: p,
			Stats: PrinterStats{
				State: "offline",
			},
			SDCard: VirtualSDCard{},
		}

	}
	PrintersMapLock.Unlock()

	guppyMux := http.NewServeMux()

	guppyFloHandler := gziphandler.GzipHandler(http.FileServer(http.Dir("www")))

	guppyMux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		http.ServeFile(w, r, "www/index.html")
	})
	guppyMux.Handle("/assets/", guppyFloHandler)

	guppyMux.HandleFunc("/v1/api/printers", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case "GET":
			PrintersMapLock.RLock()
			defer PrintersMapLock.RUnlock()
			w.Header().Set("Content-Type", "application/json")

			p := make([]PrinterInfoStatsPair, 0, len(Printers))
			for _, v := range Printers {
				p = append(p, v)
			}

			sort.SliceStable(p, func(a, b int) bool {
				return p[a].PrinterId > p[b].PrinterId
			})

			err := json.NewEncoder(w).Encode(&p)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		case "POST":
			decoder := json.NewDecoder(r.Body)
			var p GTPrinterConfig
			err := decoder.Decode(&p)
			if err != nil {
				log.Println(err)
				http.Error(w, "Failed to decode new printer json", http.StatusBadRequest)
				return
			}

			PrintersMapLock.Lock()
			printerId := fmt.Sprintf("printer-%d", hash(fmt.Sprintf("%s:%d", p.MoonrakerIP, p.MoonrakerPort)))
			_, exists := Printers[printerId]
			if exists {
				PrintersMapLock.Unlock()
				http.Error(w, "Printer with same IP and Port already exists", http.StatusBadRequest)
				return
			}

			for camIdx := range p.Cameras {
				cameraId := fmt.Sprintf("camera-%d", hash(fmt.Sprintf("%s:%d",
					p.Cameras[camIdx].CameraIp, p.Cameras[camIdx].CameraPort)))

				p.Cameras[camIdx].Id = cameraId
			}

			newPrinter := PrinterInfoStatsPair{
				PrinterId:   printerId,
				PrinterInfo: p,
				Stats: PrinterStats{
					State: "offline",
				},
				SDCard: VirtualSDCard{},
			}

			Printers[printerId] = newPrinter
			PrintersMapLock.Unlock()

			startPrinterPoller([]GTPrinterConfig{p})
			setupPrinterRoutes(guppyMux, []GTPrinterConfig{p})

			GTConfigLock.Lock()
			gtconfig.Printers = append(gtconfig.Printers, p)
			saveGTConfig(gtconfig)
			GTConfigLock.Unlock()
			err = json.NewEncoder(w).Encode(&newPrinter)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		case "DELETE":
			printerId := r.URL.Query().Get("id")
			if printerId != "" {
				PrintersMapLock.Lock()
				printer, exists := Printers[printerId]
				if !exists {
					PrintersMapLock.Unlock()
					http.Error(w, "Printer doesn't exist for deletion", http.StatusBadRequest)
					return
				}

				delete(Printers, printerId)
				quitChannel, exists := PrinterQuitChannels[printerId]
				if exists {
					quitChannel <- true
					delete(PrinterQuitChannels, printerId)
				}

				PrintersMapLock.Unlock()
				gtConfigDeletePrinter(printer.PrinterInfo.MoonrakerIP, printer.PrinterInfo.MoonrakerPort)
				w.WriteHeader(http.StatusNoContent)
			}

		default:
			http.Error(w, "405 unsupported method", http.StatusMethodNotAllowed)
		}

	})

	guppyMux.HandleFunc("/v1/api/settings", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case "GET":
			GTConfigLock.RLock()
			defer GTConfigLock.RUnlock()

			w.Header().Set("Content-Type", "application/json")
			var provider string = "google"
			var oauthEmail string
			if len(gtconfig.OAuthConfig) > 0 {
				provider = gtconfig.OAuthConfig[0].Provider

				if len(gtconfig.OAuthConfig[0].OAuthEmails) > 0 {
					oauthEmail = gtconfig.OAuthConfig[0].OAuthEmails[0]
				}
			}

			var apiKey string
			if gtconfig.NgrokApiKey != nil {
				apiKey = *gtconfig.NgrokApiKey
			}

			var authToken string
			if gtconfig.NgrokAuthToken != nil {
				authToken = *gtconfig.NgrokAuthToken
			}

			settings := GTUISettings{
				NgrokApiKey:        apiKey,
				NgrokAuthToken:     authToken,
				NgrokOAuthProvider: provider,
				NgrokOAuthEmail:    oauthEmail,
				GuppyFloPort:       gtconfig.GuppyFloPort,
			}

			if TSAuthURL != "" {
				settings.TSAuthURL = TSAuthURL
			}

			err := json.NewEncoder(w).Encode(&settings)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		case "POST":
			decoder := json.NewDecoder(r.Body)
			var s GTUISettings
			err := decoder.Decode(&s)
			if err != nil {
				http.Error(w, "Failed to decode settings", http.StatusBadRequest)
				return
			}

			GTConfigLock.Lock()
			gtconfig.GuppyFloPort = s.GuppyFloPort
			gtconfig.NgrokApiKey = &s.NgrokApiKey
			gtconfig.NgrokAuthToken = &s.NgrokAuthToken
			gtconfig.OAuthConfig = []GTOAuthConfig{
				GTOAuthConfig{
					Provider: s.NgrokOAuthProvider,
					OAuthEmails: []string{
						s.NgrokOAuthEmail,
					},
				},
			}

			saveGTConfig(gtconfig)
			GTConfigLock.Unlock()

			err = json.NewEncoder(w).Encode(&s)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}

		default:
			http.Error(w, "405 unsupported method", http.StatusMethodNotAllowed)
		}

	})

	fluiddMux := http.NewServeMux()
	fluiddMux.Handle("/", gziphandler.GzipHandler(http.FileServer(http.Dir("fluidd"))))

	go func() {
		log.Fatal(http.ListenAndServe(":9871", fluiddMux))
	}()

	setupPrinterRoutes(guppyMux, gtconfig.Printers)
	mainsailMux := http.NewServeMux()
	mainsailMux.Handle("/", gziphandler.GzipHandler(http.FileServer(http.Dir("mainsail"))))

	go func() {
		log.Fatal(http.ListenAndServe(":9872", mainsailMux))
	}()

	tsServer := new(tsnet.Server)
	tsServer.Hostname = "guppyflo"
	defer tsServer.Close()
	tsListener, tserr := tsServer.Listen("tcp", ":80")
	if tserr != nil {
		log.Fatal(tserr)
	}
	defer tsListener.Close()

	lc, err := tsServer.LocalClient()
	if err != nil {
		log.Fatalf("failed to create ts local client: %v", err)
	}

	// poll for ts auth url
	go func() {
		for _ = range time.Tick(1 * time.Second) {
			status, err := lc.Status(context.Background())
			if err != nil {
				log.Println("error polling ts state: %v", err)
				continue
			}

			if status.BackendState != "NeedsLogin" && status.BackendState != "NoState" {
				log.Printf("ts already authenticated")
				if status.AuthURL == "" {
					GTConfigLock.Lock()
					TSAuthURL = status.AuthURL
					GTConfigLock.Unlock()
				}
				return
			}

			if status.BackendState == "NeedsLogin" {
				GTConfigLock.Lock()
				TSAuthURL = status.AuthURL
				GTConfigLock.Unlock()
				log.Printf("ts need auth - auth url: %s", status.AuthURL)
			}
		}
	}()

	go func() {
		http.Serve(tsListener, guppyMux)
	}()

	if !enableNgrok {
		log.Println("Serving GuppyFLO locally on port", gtconfig.GuppyFloPort)
		return http.ListenAndServe(fmt.Sprintf(":%d", gtconfig.GuppyFloPort), guppyMux) //local
	}

	var oauths []config.HTTPEndpointOption
	for _, oa := range gtconfig.OAuthConfig {
		if len(oa.OAuthEmails) > 0 {
			var oauthEmails []config.OAuthOption
			for _, email := range oa.OAuthEmails {
				oauthEmails = append(oauthEmails, config.WithAllowOAuthEmail(email))
			}

			if len(oauthEmails) > 0 {
				oauths = append(oauths, config.WithOAuth(oa.Provider, oauthEmails...))
			}
		}
	}

	if len(oauths) == 0 {
		return errors.New("OAuth is misconfigured.")
	}

	ln, err := ngrok.Listen(ctx,
		config.HTTPEndpoint(oauths...,
		),
		ngrok.WithAuthtoken(*gtconfig.NgrokAuthToken),
	)
	if err != nil {
		return err
	}

	log.Println("Serving GuppyFLO remotely at:", ln.URL())

	go func() {
		log.Println("Serving GuppyFLO locally on port", gtconfig.GuppyFloPort)
		log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", gtconfig.GuppyFloPort), guppyMux)) //local
	}()

	return http.Serve(ln, guppyMux) // ngrok

}

func reverseProxyHandler(p *httputil.ReverseProxy, url *url.URL) func(http.ResponseWriter, *http.Request) {
	return func(res http.ResponseWriter, req *http.Request) {
		req.Header.Add("X-Scheme", "http")
		req.Header.Set("X-Real-IP", "127.0.0.1")
		req.Host = url.Host
		req.Header.Add("Origin", "guppytunnel-client.local")
		p.ServeHTTP(res, req)

	}
}

func hash(s string) uint32 {
	h := fnv.New32a()
	h.Write([]byte(s))
	return h.Sum32()
}

func startPrinterPoller(printers []GTPrinterConfig) {
	for _, printer := range printers {
		// printerId := fmt.Sprintf("printer%d", i)
		quitSignal := make(chan bool)
		go func(p GTPrinterConfig, quit chan bool) {
			log.Println("Connecting to printer at:", p.MoonrakerIP, p.MoonrakerPort)
			printerId := fmt.Sprintf("printer-%d", hash(fmt.Sprintf("%s:%d", p.MoonrakerIP, p.MoonrakerPort)))
			// log.PrintLn("Starting fetcher for printer at ", p.MoonrakerIP, p.MoonrakerPort)
			maxFailedAttempt := 3
			printerUrl := fmt.Sprintf("http://%v:%v/printer/objects/query?print_stats&virtual_sdcard&extruder&heater_bed",
				p.MoonrakerIP, p.MoonrakerPort)
			for _ = range time.Tick(3 * time.Second) {
				// log.Println("getting from ", printerUrl, now)
				select {
				case <-quit:
					log.Println("Stop polling for printer", p.MoonrakerIP, p.MoonrakerPort)
					return
				default:
					resp, err := client.Get(printerUrl)
					if err != nil {
						maxFailedAttempt--

						if maxFailedAttempt <= 0 {
							maxFailedAttempt = 3

							// log.Println("failed 3 consective attempts, marking printer as offline")

							c <- Pair[PrinterInfoStatsPair, chan bool]{
								First: PrinterInfoStatsPair{
									PrinterId:   printerId,
									PrinterInfo: p,
									Stats: PrinterStats{
										State: "offline",
									},
									SDCard: VirtualSDCard{},
								},
								Second: quit,
							}
						}
						continue
					}

					maxFailedAttempt = 3

					defer resp.Body.Close()
					var moonrakerResult MoonrakerPrinterStats
					err = json.NewDecoder(resp.Body).Decode(&moonrakerResult)

					if err != nil {
						log.Println("error coding pstats", err)
					}

					// log.Println("state", moonrakerResult.Result.Status.Stats.State)

					c <- Pair[PrinterInfoStatsPair, chan bool]{
						First: PrinterInfoStatsPair{
							PrinterId:   printerId,
							PrinterInfo: p,
							Stats:       moonrakerResult.Result.Status.Stats,
							SDCard:      moonrakerResult.Result.Status.SDCard,
							Extruder:    moonrakerResult.Result.Status.Extruder,
							HeaterBed:   moonrakerResult.Result.Status.HeaterBed,
						},
						Second: quit,
					}
				}
			}
		}(printer, quitSignal)
	}
}

func startPrinterDataConsumer() {
	go func() {
		// reader
		for ps := range c {
			// log.Println("read pstat", ps)
			PrintersMapLock.Lock()
			Printers[ps.First.PrinterId] = ps.First
			PrinterQuitChannels[ps.First.PrinterId] = ps.Second
			PrintersMapLock.Unlock()
		}
	}()

}

func setupMoonrakerAndUIRoutes(
	guppyMux *http.ServeMux,
	printerId string,
	moonrakerRemote *url.URL,
	moonrakerProxy *httputil.ReverseProxy,
	uiPrefix string,
	uiRemote *url.URL,
	uiProxy *httputil.ReverseProxy) {

	prefix := fmt.Sprintf("/%s/%s", printerId, uiPrefix)
	log.Println("Creating printer routes at", moonrakerRemote, prefix)

	moonrakerGzHandler := gziphandler.GzipHandler(
		http.StripPrefix(prefix, http.HandlerFunc(reverseProxyHandler(moonrakerProxy, moonrakerRemote))))

	guppyMux.Handle(prefix+"/websocket", moonrakerGzHandler)
	guppyMux.Handle(prefix+"/printer/", moonrakerGzHandler)
	guppyMux.Handle(prefix+"/api/", moonrakerGzHandler)
	guppyMux.Handle(prefix+"/access/", moonrakerGzHandler)
	guppyMux.Handle(prefix+"/machine/", moonrakerGzHandler)
	guppyMux.Handle(prefix+"/server/", moonrakerGzHandler)

	uiGzHandler := gziphandler.GzipHandler(
		http.StripPrefix(prefix, http.HandlerFunc(reverseProxyHandler(uiProxy, uiRemote))))

	guppyMux.Handle(prefix+"/", uiGzHandler)
}

func setupPrinterRoutes(guppyMux *http.ServeMux, printers []GTPrinterConfig) {
	fluiddUrl, _ := url.Parse("http://127.0.0.1:9871")
	fluiddProxy := httputil.NewSingleHostReverseProxy(fluiddUrl)

	mainsailUrl, _ := url.Parse("http://127.0.0.1:9872")
	mainsailProxy := httputil.NewSingleHostReverseProxy(mainsailUrl)

	for _, p := range printers {
		remote, err := url.Parse(fmt.Sprintf("http://%s:%d", p.MoonrakerIP, p.MoonrakerPort))
		if err != nil {
			log.Println("Failed to create URL from printer IP/Port", p.MoonrakerIP, p.MoonrakerPort)
			continue
		}

		printerId := fmt.Sprintf("printer-%d", hash(fmt.Sprintf("%s:%d", p.MoonrakerIP, p.MoonrakerPort)))

		proxy := httputil.NewSingleHostReverseProxy(remote)

		setupMoonrakerAndUIRoutes(guppyMux, printerId, remote, proxy, "fluidd", fluiddUrl, fluiddProxy)
		setupMoonrakerAndUIRoutes(guppyMux, printerId, remote, proxy, "mainsail", mainsailUrl, mainsailProxy)

		cameras := make(map[string]string)
		for _, cam := range p.Cameras {
			cameraId := fmt.Sprintf("camera-%d", hash(fmt.Sprintf("%s:%d", cam.CameraIp, cam.CameraPort)))
			_, exists := cameras[cameraId]
			if !exists {
				cameras[cameraId] = cameraId

				cameraUrl, err2 := url.Parse(fmt.Sprintf("http://%s:%d", cam.CameraIp, cam.CameraPort))
				if err2 != nil {
					log.Println("Failed to create URL from for printer cameras", cam.CameraIp, cam.CameraPort)
				}

				cameraPrefix := fmt.Sprintf("/%s/%s/", printerId, cameraId)
				cameraProxy := httputil.NewSingleHostReverseProxy(cameraUrl)

				log.Println("Creating camera routes at", cameraUrl, cameraPrefix)

				guppyMux.Handle(cameraPrefix,
					gziphandler.GzipHandler(http.StripPrefix(cameraPrefix,
						http.HandlerFunc(reverseProxyHandler(cameraProxy, cameraUrl)))))
			}
		}
	}
}
