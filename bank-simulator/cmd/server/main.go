package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"titanes-portfolio/bank-simulator/pkg/client"
	"titanes-portfolio/bank-simulator/pkg/parser"
	"titanes-portfolio/bank-simulator/pkg/web"
)

func getLocalIP() string {
	// Strategy 1: Outbound route discovery (asks Windows routing table for primary route)
	conn, err := net.DialTimeout("udp", "8.8.8.8:80", 800*time.Millisecond)
	if err == nil {
		defer conn.Close()
		if localAddr, ok := conn.LocalAddr().(*net.UDPAddr); ok && localAddr.IP.To4() != nil {
			ip := localAddr.IP.String()
			if !strings.HasPrefix(ip, "127.") && !strings.HasPrefix(ip, "169.254.") {
				return ip
			}
		}
	}

	// Strategy 2: Interface inspection filtering loopback and link-local (169.254.x.x)
	interfaces, err := net.Interfaces()
	if err == nil {
		for _, iface := range interfaces {
			if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
				continue
			}
			addrs, err := iface.Addrs()
			if err != nil {
				continue
			}
			for _, addr := range addrs {
				if ipnet, ok := addr.(*net.IPNet); ok {
					ip := ipnet.IP
					if ip.To4() != nil && !ip.IsLoopback() && !ip.IsLinkLocalUnicast() {
						ipStr := ip.String()
						// Prioritize standard home Wi-Fi ranges (192.168.x.x, 10.x.x.x)
						if strings.HasPrefix(ipStr, "192.168.") || strings.HasPrefix(ipStr, "10.") {
							return ipStr
						}
					}
				}
			}
		}
	}

	return "127.0.0.1"
}

func getEnv(key, fallback string) string {
	if val, ok := os.LookupEnv(key); ok && val != "" {
		return val
	}
	return fallback
}

func main() {
	// CLI Flags with environment variable fallbacks
	portFlag := flag.Int("port", 8080, "Port for the HTTP server")
	backendFlag := flag.String("backend", getEnv("TITANES_BACKEND_URL", "http://localhost:8000"), "Target Titanes Portfolio FastAPI URL")
	secretFlag := flag.String("secret", getEnv("WEBHOOK_SECRET_KEY", "titanes_sec_e8b919f4088a53e6b4d32091c6e1a4e2"), "Webhook authentication secret key")
	flag.Parse()

	// If environment PORT is specified (e.g., PaaS or Docker)
	if envPort := os.Getenv("PORT"); envPort != "" {
		if p, err := strconv.Atoi(envPort); err == nil {
			*portFlag = p
		}
	}

	localIP := getLocalIP()

	// Initialize core components
	engine := parser.NewEngine()
	apiClient := client.NewClient(*backendFlag, *secretFlag, 12*time.Second)
	broker := web.NewBroker()
	server := web.NewServer(engine, apiClient, broker, localIP, *portFlag)

	// Styling Banner
	fmt.Println()
	fmt.Println("============================================================================")
	fmt.Println("   ⚡ TITANES PORTFOLIO - BANK NOTIFICATION SIMULATOR & GATEWAY (Go) ⚡   ")
	fmt.Println("============================================================================")
	fmt.Printf("   * Interfaz Web Local:     http://localhost:%d\n", *portFlag)
	fmt.Printf("   * Acceso Red (Celular):   http://%s:%d  <-- Abre en Android\n", localIP, *portFlag)
	fmt.Printf("   * Webhook Receptor:       http://%s:%d/api/notifications/incoming\n", localIP, *portFlag)
	fmt.Printf("   * Consola SSE:            http://%s:%d/api/logs/stream\n", localIP, *portFlag)
	fmt.Printf("   * Destino Titanes API:    %s/api/webhooks/mobile-transaction\n", apiClient.BaseURL())
	fmt.Println("============================================================================")
	fmt.Println("   Presiona Ctrl+C para detener el servidor de forma segura.")
	fmt.Println("============================================================================")
	fmt.Println()

	httpServer := &http.Server{
		Addr:         fmt.Sprintf("0.0.0.0:%d", *portFlag),
		Handler:      server.Handler(),
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Server shutdown channel
	shutdownChan := make(chan os.Signal, 1)
	signal.Notify(shutdownChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("❌ Error crítico en servidor HTTP: %v", err)
		}
	}()

	<-shutdownChan
	fmt.Println("\n🛑 Apagando el simulador bancario de forma segura...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := httpServer.Shutdown(ctx); err != nil {
		log.Printf("⚠️ Error durante el apagado seguro: %v", err)
	} else {
		fmt.Println("✅ Servidor detenido correctamente. ¡Hasta pronto!")
	}
}
