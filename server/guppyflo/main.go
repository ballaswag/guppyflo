package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"hash/fnv"
	"io"
	"io/ioutil"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"slices"
	"sort"
	"strconv"
	"strings"
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

type CameraInfo struct {
	Name        string `json:"name"`
	Service     string `json:"service"`
	UrlStream   string `json:"stream_url"`
	UrlSnapshot string `json:"snapshot_url"`
	Enabled     bool   `json:"enabled"`
}

type MoonrakerCameras struct {
	Result struct {
		Webcams []CameraInfo `json:"webcams"`
	} `json:"result"`
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
	PrinterMuxes        map[string]*http.ServeMux
	CameraMuxes         map[string]*http.ServeMux
	PrintersMapLock     sync.RWMutex

	TSAuthURL    string
	gtconfig     = loadGTConfig("guppytunnel.json")
	GTConfigLock sync.RWMutex

	c      = make(chan Pair[PrinterInfoStatsPair, chan bool])
	client = http.Client{Timeout: 3 * time.Second}

	FluiddUrl     *url.URL
	FluiddProxy   *httputil.ReverseProxy
	MainsailUrl   *url.URL
	MainsailProxy *httputil.ReverseProxy
)

func main() {
	LOG_FILE := "guppyflo.log"

	logFile, err := os.OpenFile(LOG_FILE, os.O_APPEND|os.O_RDWR|os.O_CREATE, 0644)
	if err != nil {
		log.Panic(err)
	}
	mw := io.MultiWriter(os.Stdout, logFile)

	defer logFile.Close()
	log.SetOutput(mw)

	if err := run(context.Background()); err != nil {
		log.Fatal(err)
	}
}

func run(ctx context.Context) error {

	Printers = make(map[string]PrinterInfoStatsPair)
	PrinterQuitChannels = make(map[string]chan bool)
	PrinterMuxes = make(map[string]*http.ServeMux)
	CameraMuxes = make(map[string]*http.ServeMux)

	FluiddUrl, _ := url.Parse("http://127.0.0.1:9871")
	FluiddProxy := httputil.NewSingleHostReverseProxy(FluiddUrl)

	MainsailUrl, _ := url.Parse("http://127.0.0.1:9872")
	MainsailProxy := httputil.NewSingleHostReverseProxy(MainsailUrl)

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
		printerId := fmt.Sprintf("%d", hash(fmt.Sprintf("%s:%d", p.MoonrakerIP, p.MoonrakerPort)))
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

	guppyMux.HandleFunc("/printers/{printerId}/{rest...}", func(w http.ResponseWriter, r *http.Request) {
		printerId := r.PathValue("printerId")
		PrintersMapLock.RLock()
		mux, exists := PrinterMuxes[printerId]
		PrintersMapLock.RUnlock()
		if exists {
			mux.ServeHTTP(w, r)
			return
		}

		http.Error(w, "printer routers not found", http.StatusNotFound)
	})

	guppyMux.HandleFunc("GET /v1/api/cameras", func(w http.ResponseWriter, r *http.Request) {
		ip := r.URL.Query().Get("ip")
		port := r.URL.Query().Get("port")
		if ip != "" && port != "" {
			cameras := findCameras(ip, port)

			w.Header().Set("Content-Type", "application/json")
			err := json.NewEncoder(w).Encode(&cameras)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			return
		}
		http.Error(w, "bad camera discovery request", http.StatusBadRequest)
	})

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
			printerId := fmt.Sprintf("%d", hash(fmt.Sprintf("%s:%d", p.MoonrakerIP, p.MoonrakerPort)))
			_, exists := Printers[printerId]
			if exists {
				PrintersMapLock.Unlock()
				http.Error(w, "Printer with same IP and Port already exists", http.StatusBadRequest)
				return
			}

			for camIdx := range p.Cameras {
				cameraId := getCameraId(p.Cameras[camIdx])
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
			setupPrinterRoutes([]GTPrinterConfig{p}, FluiddUrl, FluiddProxy, MainsailUrl, MainsailProxy)

			GTConfigLock.Lock()
			defer GTConfigLock.Unlock()
			gtconfig.Printers = append(gtconfig.Printers, p)
			saveGTConfig(gtconfig)

			err = json.NewEncoder(w).Encode(&newPrinter)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		case "PUT":
			decoder := json.NewDecoder(r.Body)
			var p GTPrinterConfig
			err := decoder.Decode(&p)
			if err != nil {
				log.Println(err)
				http.Error(w, "Failed to decode new printer json", http.StatusBadRequest)
				return
			}

			PrintersMapLock.Lock()
			defer PrintersMapLock.Unlock()
			printerId := fmt.Sprintf("%d", hash(fmt.Sprintf("%s:%d", p.MoonrakerIP, p.MoonrakerPort)))
			printer, exists := Printers[printerId]
			if !exists {
				http.Error(w, "Printer doesn't exist for update", http.StatusBadRequest)
				return
			}

			_, exists = PrinterMuxes[printerId]
			if !exists {
				http.Error(w, "Printer mux doesn't exist for update", http.StatusBadRequest)
				return
			}

			// delete camera mux
			_, exists = CameraMuxes[printerId]
			if exists {
				delete(CameraMuxes, printerId)
			}

			for camIdx := range p.Cameras {
				cameraId := getCameraId(p.Cameras[camIdx])
				p.Cameras[camIdx].Id = cameraId
			}

			// recreate camera mux
			cameraMux := setupCameraMuxes(p.Cameras, printerId)
			if cameraMux != nil {
				CameraMuxes[printerId] = cameraMux
			}

			// update printer name
			GTConfigLock.Lock()
			defer GTConfigLock.Unlock()
			pidx := slices.IndexFunc(gtconfig.Printers, func(p GTPrinterConfig) bool {
				return p.MoonrakerIP == printer.PrinterInfo.MoonrakerIP && p.MoonrakerPort == printer.PrinterInfo.MoonrakerPort
			})

			// save printer config
			gtconfig.Printers[pidx].Cameras = p.Cameras
			gtconfig.Printers[pidx].Name = p.Name
			saveGTConfig(gtconfig)

			// update in-mem printer obj
			printer.PrinterInfo = gtconfig.Printers[pidx]
			Printers[printerId] = printer

			err = json.NewEncoder(w).Encode(&printer)
			if err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		case "DELETE":
			printerId := r.URL.Query().Get("id")
			if printerId != "" {
				PrintersMapLock.Lock()
				defer PrintersMapLock.Unlock()

				printer, exists := Printers[printerId]
				if !exists {
					http.Error(w, "Printer doesn't exist for deletion", http.StatusBadRequest)
					return
				}

				delete(Printers, printerId)
				quitChannel, exists := PrinterQuitChannels[printerId]
				if exists && quitChannel != nil {
					quitChannel <- true
					close(quitChannel)
					// mark it nil, let startPrinterDataConsumer delete it from map
					PrinterQuitChannels[printerId] = nil
					// delete(PrinterQuitChannels, printerId)
				}

				_, exists = PrinterMuxes[printerId]
				if exists {
					delete(PrinterMuxes, printerId)
				}

				_, exists = CameraMuxes[printerId]
				if exists {
					delete(CameraMuxes, printerId)
				}

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

	setupPrinterRoutes(gtconfig.Printers, FluiddUrl, FluiddProxy, MainsailUrl, MainsailProxy)
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
				log.Println("error polling ts state:", err)
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
	PrintersMapLock.Lock()
	for _, p := range printers {
		printerId := fmt.Sprintf("%d", hash(fmt.Sprintf("%s:%d", p.MoonrakerIP, p.MoonrakerPort)))
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

	for _, printer := range printers {
		// printerId := fmt.Sprintf("printer%d", i)
		quitSignal := make(chan bool)
		go func(p GTPrinterConfig, quit chan bool) {
			log.Println("Connecting to printer at:", p.MoonrakerIP, p.MoonrakerPort)
			printerId := fmt.Sprintf("%d", hash(fmt.Sprintf("%s:%d", p.MoonrakerIP, p.MoonrakerPort)))
			// log.PrintLno("Starting fetcher for printer at ", p.MoonrakerIP, p.MoonrakerPort)
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
									PrinterId: printerId,
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
						log.Println("error decoding pstats", err)
					}

					c <- Pair[PrinterInfoStatsPair, chan bool]{
						First: PrinterInfoStatsPair{
							PrinterId: printerId,
							Stats:     moonrakerResult.Result.Status.Stats,
							SDCard:    moonrakerResult.Result.Status.SDCard,
							Extruder:  moonrakerResult.Result.Status.Extruder,
							HeaterBed: moonrakerResult.Result.Status.HeaterBed,
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
			PrintersMapLock.Lock()
			quitChannel, exists := PrinterQuitChannels[ps.First.PrinterId]
			if exists && quitChannel == nil {
				// printer was deleted, don't re-add it
				delete(PrinterQuitChannels, ps.First.PrinterId)
				PrintersMapLock.Unlock()
				continue
			}

			// continue to add/update the printer
			ps.First.PrinterInfo = Printers[ps.First.PrinterId].PrinterInfo
			Printers[ps.First.PrinterId] = ps.First
			PrinterQuitChannels[ps.First.PrinterId] = ps.Second
			PrintersMapLock.Unlock()
		}
	}()

}

func setupMoonrakerAndUIRoutes(
	printerMux *http.ServeMux,
	moonrakerRemote *url.URL,
	moonrakerProxy *httputil.ReverseProxy,
	uiPrefix string,
	uiRemote *url.URL,
	uiProxy *httputil.ReverseProxy,
	cameras []GTPrinterCamerasConfig) {

	prefix := fmt.Sprintf("/printers/%s", uiPrefix)
	log.Println("Creating printer routes at", moonrakerRemote, prefix)

	moonrakerGzHandler := gziphandler.GzipHandler(
		http.StripPrefix(prefix, http.HandlerFunc(reverseProxyHandler(moonrakerProxy, moonrakerRemote))))

	printerMux.Handle(prefix+"/websocket", moonrakerGzHandler)
	printerMux.Handle(prefix+"/printer/", moonrakerGzHandler)
	printerMux.Handle(prefix+"/api/", moonrakerGzHandler)
	printerMux.Handle(prefix+"/access/", moonrakerGzHandler)
	printerMux.Handle(prefix+"/machine/", moonrakerGzHandler)
	printerMux.Handle(prefix+"/server/", moonrakerGzHandler)

	// setup route on ui root, e.g. fluid/ mainsail/
	visitedCameras := make(map[string]string)
	for _, cam := range cameras {
		parts := strings.Split(cam.Path, "?")
		camPath := cam.Path
		if len(parts) > 1 {
			camPath = parts[0]
		}
		_, exists := visitedCameras[camPath]
		if !exists {
			visitedCameras[camPath] = camPath

			cameraUrl, err2 := url.Parse(fmt.Sprintf("http://%s:%d", cam.CameraIp, cam.CameraPort))
			if err2 != nil {
				log.Println("Failed to create URL from for printer cameras", cam.CameraIp, cam.CameraPort)
			}

			pathParts := strings.Split(strings.TrimPrefix(cam.Path, "/"), "/")
			// this check is to prevent creating a route at / where ui files are already being served
			if len(pathParts) > 1 && (!strings.Contains(pathParts[0], "?") && !strings.Contains(pathParts[0], "=")) {
				cameraPrefix := fmt.Sprintf(prefix+"/%s/", pathParts[0])
				cameraProxy := httputil.NewSingleHostReverseProxy(cameraUrl)

				log.Println("Creating camera routes at", cameraUrl, cameraPrefix)

				printerMux.Handle(cameraPrefix, gziphandler.GzipHandler(http.StripPrefix(prefix,
					http.HandlerFunc(reverseProxyHandler(cameraProxy, cameraUrl)))))
			}
		}
	}

	if uiProxy != nil {
		uiGzHandler := gziphandler.GzipHandler(
			http.StripPrefix(prefix, http.HandlerFunc(reverseProxyHandler(uiProxy, uiRemote))))

		printerMux.Handle(prefix+"/", uiGzHandler)
	}
}

func setupPrinterRoutes(printers []GTPrinterConfig,
	fluiddUrl *url.URL,
	fluiddProxy *httputil.ReverseProxy,
	mainsailUrl *url.URL,
	mainsailProxy *httputil.ReverseProxy) {

	for _, p := range printers {
		remote, err := url.Parse(fmt.Sprintf("http://%s:%d", p.MoonrakerIP, p.MoonrakerPort))
		if err != nil {
			log.Println("Failed to create URL from printer IP/Port", p.MoonrakerIP, p.MoonrakerPort)
			continue
		}

		// try to discover camera port for relative camera paths
		moonrakerCams := getMoonrakerCameras(p.MoonrakerIP, strconv.Itoa(p.MoonrakerPort))
		autoDetectedCams := findCameras(p.MoonrakerIP, strconv.Itoa(p.MoonrakerPort))

		configurableCams := make(map[string]GTPrinterCamerasConfig)
		for _, mc := range moonrakerCams {
			for _, detectedCam := range autoDetectedCams {
				if mc.UrlStream == detectedCam.Path {
					cameraId := getCameraId(detectedCam)
					_, exists := configurableCams[cameraId]
					if !exists {
						configurableCams[cameraId] = detectedCam
					}
					break
				}
			}
		}

		for _, cam := range p.Cameras {
			delete(configurableCams, cam.Id)
		}

		// add any unique ones to the camera list
		for _, v := range configurableCams {
			p.Cameras = append(p.Cameras, v)
		}

		printerMux := http.NewServeMux()
		printerId := fmt.Sprintf("%d", hash(fmt.Sprintf("%s:%d", p.MoonrakerIP, p.MoonrakerPort)))
		proxy := httputil.NewSingleHostReverseProxy(remote)
		fluiddPrefix := printerId + "/fluidd"
		mainsailPrefix := printerId + "/mainsail"

		setupMoonrakerAndUIRoutes(printerMux, remote, proxy, fluiddPrefix, fluiddUrl, fluiddProxy, p.Cameras)
		setupMoonrakerAndUIRoutes(printerMux, remote, proxy, mainsailPrefix, mainsailUrl, mainsailProxy, p.Cameras)

		// short paths for moonraker
		setupMoonrakerAndUIRoutes(printerMux, remote, proxy, printerId, nil, nil, nil)

		camerasMux := setupCameraMuxes(p.Cameras, printerId)

		if camerasMux != nil {
			printerMux.HandleFunc("/printers/{printerId}/cameras/{rest...}", func(w http.ResponseWriter, r *http.Request) {
				printerId := r.PathValue("printerId")
				PrintersMapLock.RLock()
				mux, exists := CameraMuxes[printerId]
				PrintersMapLock.RUnlock()
				if exists {
					mux.ServeHTTP(w, r)
					return
				}

				http.Error(w, "camera routers not found", http.StatusNotFound)
			})
		}

		log.Println("Created printer mux for printer id", printerId)
		PrintersMapLock.Lock()
		PrinterMuxes[printerId] = printerMux
		if camerasMux != nil {
			CameraMuxes[printerId] = camerasMux
		}
		PrintersMapLock.Unlock()
	}
}

func setupCameraMuxes(cameras []GTPrinterCamerasConfig, printerId string) *http.ServeMux {
	var camerasMux *http.ServeMux = nil
	if len(cameras) > 0 {
		visitedCameras := make(map[string]string)
		camerasMux = http.NewServeMux()

		printerCameraPrefix := fmt.Sprintf("/printers/%s/cameras", printerId)

		for _, cam := range cameras {
			cameraId := getCameraId(cam)
			_, exists := visitedCameras[cameraId]
			if !exists {
				visitedCameras[cameraId] = cameraId

				cameraUrl, err2 := url.Parse(fmt.Sprintf("http://%s:%d", cam.CameraIp, cam.CameraPort))
				if err2 != nil {
					log.Println("Failed to create URL from for printer cameras", cam.CameraIp, cam.CameraPort)
				}

				cameraPrefix := fmt.Sprintf("%s/%s/", printerCameraPrefix, cameraId)
				cameraProxy := httputil.NewSingleHostReverseProxy(cameraUrl)

				log.Println("Creating camera routes at", cameraUrl, cameraPrefix)

				camerasMux.Handle(cameraPrefix, gziphandler.GzipHandler(http.StripPrefix(cameraPrefix,
					http.HandlerFunc(reverseProxyHandler(cameraProxy, cameraUrl)))))
			}
		}
	}

	return camerasMux
}

func hasMjpegStreamer(ip string, portPath string, wg *sync.WaitGroup, resultChan chan<- string) {
	defer wg.Done()
	url := fmt.Sprintf("http://%v%v", ip, portPath)
	log.Println("Checking camera path", url)

	// mjpeg streamer program.json endpoint
	programUrl := fmt.Sprintf("%s/program.json", url)
	log.Println("program url", programUrl)
	programResponse, err := client.Get(programUrl)
	log.Println("program err", err)
	if err != nil {
		resultChan <- ""
		return
	}

	if programResponse.StatusCode == http.StatusOK {
		defer programResponse.Body.Close()
		c := make(map[string][]json.RawMessage)
		log.Println("program json", c["inputs"])

		err = json.NewDecoder(programResponse.Body).Decode(&c)
		if err != nil {
			resultChan <- ""
			return
		}
		for i := range c["inputs"] {
			resultChan <- fmt.Sprintf("mjpeg-stream|%s/?action=stream_%d", url, i)
		}

		resultChan <- ""
		return
	}

	resp, err := client.Get(url)
	if err != nil {
		resultChan <- ""
		return
	}

	if resp.StatusCode == http.StatusOK {
		defer resp.Body.Close()
		respBody, err := io.ReadAll(resp.Body)
		if err != nil {
			resultChan <- ""
			return
		}

		if strings.Contains(string(respBody), "Details about the M-JPEG streamer") {
			resultChan <- fmt.Sprintf("mjpeg-stream|%s", url)
			return
		}
	}

	resultChan <- ""
}

func hasGo2Rtc(ip string, wg *sync.WaitGroup, go2rtcChan chan<- string) {
	defer wg.Done()
	url := fmt.Sprintf("http://%s:1984/api/streams", ip)
	log.Println("Checking camera path", url)
	resp, err := client.Get(url)
	if err != nil {
		go2rtcChan <- ""
		return
	}
	if resp.StatusCode == http.StatusOK {
		defer resp.Body.Close()
		c := make(map[string]json.RawMessage)
		err = json.NewDecoder(resp.Body).Decode(&c)

		if err != nil {
			go2rtcChan <- ""
			return
		}

		for k, _ := range c {
			go2rtcChan <- fmt.Sprintf("go2rtc|http://%s:1984/stream.html?src=%s", ip, k)
		}
	}

	go2rtcChan <- ""
}

func findCameras(ip string, port string) []GTPrinterCamerasConfig {
	var wg sync.WaitGroup
	resultChan := make(chan string)
	for _, path := range []string{":4408/webcam", ":4409/webcam", ":80/webcam",
		":80/webcam2", ":80/webcam3", ":80/webcam4"} {
		wg.Add(1)
		go hasMjpegStreamer(ip, path, &wg, resultChan)
	}

	wg.Add(1)
	go hasGo2Rtc(ip, &wg, resultChan)

	go func() {
		wg.Wait()
		close(resultChan)
	}()

	cameras := make([]GTPrinterCamerasConfig, 0)
	for r := range resultChan {
		if r != "" {
			parts := strings.Split(r, "|")
			camType := parts[0]
			fullUrl := parts[1]

			u, err := url.Parse(fullUrl)
			if err != nil {
				log.Println("Failed to parse camera url. Skipping", fullUrl)
				continue
			}
			camHost, p, err := net.SplitHostPort(u.Host)
			if err != nil {
				log.Println("Failed to split camera host/port. Skipping", u.Host)
				continue
			}

			camPort, err := strconv.Atoi(p)
			if err != nil {
				log.Println("Failed to parse port. Skipping", p)
				continue
			}

			// path := fmt.Sprintf("%s/?action=stream", u.Path)
			// if camType == "go2rtc" {
			path := fmt.Sprintf("%s?%s", u.Path, u.RawQuery)
			// }

			cam := GTPrinterCamerasConfig{
				Type:       camType,
				CameraIp:   camHost,
				CameraPort: camPort,
				Path:       path,
			}
			cameraId := getCameraId(cam)
			cam.Id = cameraId
			cameras = append(cameras, cam)
		}
	}

	log.Println("auto detected cameras", cameras)

	return cameras
}

func getMoonrakerCameras(ip string, port string) []CameraInfo {
	camUrl := fmt.Sprintf("http://%v:%v/server/webcams/list",
		ip, port)
	resp, err := client.Get(camUrl)

	if err != nil {
		return nil
	}

	cams := make([]CameraInfo, 0)
	if resp.StatusCode == http.StatusOK {
		defer resp.Body.Close()
		var cameraResult MoonrakerCameras
		err = json.NewDecoder(resp.Body).Decode(&cameraResult)
		if err != nil {
			log.Println("error decoding cameras from moonraker", err)
		}

		for _, c := range cameraResult.Result.Webcams {
			// don't need any that has a full URL
			_, err := url.Parse(c.UrlStream)
			if c.Enabled && err == nil {
				cams = append(cams, c)
			}
		}
	}

	log.Println("cameras", cams)
	return cams
}

func getCameraId(cam GTPrinterCamerasConfig) string {
	return fmt.Sprintf("%d", hash(fmt.Sprintf("%s:%d%s", cam.CameraIp, cam.CameraPort, cam.Path)))

}
