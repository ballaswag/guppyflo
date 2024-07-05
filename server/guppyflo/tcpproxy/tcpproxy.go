// code is mostly copy-pasted from https://github.com/markpash/tailscale-sidecar
// under MIT license

package tcpproxy

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"sync"
	"time"

	"tailscale.com/client/tailscale"
	"tailscale.com/tsnet"
)

type Binding struct {
	From uint16 `json:"from"`
	To   string `json:"to"`
	Tls  bool   `json:"tls"`
}

func loadBindings(proxyPath string) ([]Binding, error) {
	bindingsFile, err := os.Open(proxyPath)
	if err != nil {
		return nil, err
	}
	defer bindingsFile.Close()

	d := json.NewDecoder(bindingsFile)

	var bindings []Binding
	if err := d.Decode(&bindings); err != nil {
		return nil, err
	}

	if len(bindings) == 0 {
		return nil, errors.New("bindings empty")
	}

	return bindings, nil
}

func proxyBind(s *tsnet.Server, lc *tailscale.LocalClient, b *Binding) {
	ln, err := s.Listen("tcp", fmt.Sprintf(":%d", b.From))
	if err != nil {
		log.Println(err)
		return
	}

	if b.Tls {
		ln = tls.NewListener(ln, &tls.Config{
			GetCertificate: lc.GetCertificate,
		})
	}

	log.Printf("started proxy bind from %d to %v (tls: %t)", b.From, b.To, b.Tls)

	for {
		conn, err := ln.Accept()
		if err != nil {
			log.Println(err)
			continue
		}

		go func(left net.Conn) {
			defer left.Close()

			right, err := net.Dial("tcp", b.To)
			if err != nil {
				log.Println(err)
				return
			}
			defer right.Close()

			var wg sync.WaitGroup
			proxyConn := func(a, b net.Conn) {
				defer wg.Done()
				_, err := io.Copy(a, b)
				if err != nil {
					log.Println(err)
					return
				}
			}

			wg.Add(2)
			go proxyConn(right, left)
			go proxyConn(left, right)

			wg.Wait()
		}(conn)
	}
}

func Run(proxyPath string) {
	bindings, err := loadBindings(proxyPath)
	if err != nil {
		panic(err)
	}

	s := tsnet.Server{
		Hostname: "guppyflo",
	}

	lc, err := s.LocalClient()
	if err != nil {
		log.Fatalf("failed to create ts local client: %v", err)
	}

	go func() {
		for _ = range time.Tick(3 * time.Second) {
			status, err := lc.Status(context.Background())
			if err != nil {
				log.Println("error polling ts state:", err)
				continue
			}

			if status.BackendState != "NeedsLogin" && status.BackendState != "NoState" {
				log.Printf("ts already authenticated")
				return
			}

			if status.BackendState == "NeedsLogin" {
				log.Printf("ts need auth - auth url: %s", status.AuthURL)
			}
		}
	}()

	var wg sync.WaitGroup
	for _, binding := range bindings {
		wg.Add(1)
		go func(binding Binding) {
			defer wg.Done()
			proxyBind(&s, lc, &binding)
		}(binding)
	}
	wg.Wait()
}
