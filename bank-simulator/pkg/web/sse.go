package web

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"titanes-portfolio/bank-simulator/pkg/models"
)

// Broker handles multi-client Server-Sent Events broadcasting with recent history replay.
type Broker struct {
	clients        map[chan models.LogEvent]bool
	newClients     chan chan models.LogEvent
	closingClients chan chan models.LogEvent
	messages       chan models.LogEvent

	history []models.LogEvent
	maxHist int
	mu      sync.RWMutex

	eventCounter uint64
}

// NewBroker initializes and starts the event streaming broker.
func NewBroker() *Broker {
	b := &Broker{
		clients:        make(map[chan models.LogEvent]bool),
		newClients:     make(chan chan models.LogEvent),
		closingClients: make(chan chan models.LogEvent),
		messages:       make(chan models.LogEvent, 100),
		history:        make([]models.LogEvent, 0, 50),
		maxHist:        50,
	}

	go b.listen()
	return b
}

func (b *Broker) listen() {
	for {
		select {
		case s := <-b.newClients:
			b.mu.Lock()
			b.clients[s] = true
			b.mu.Unlock()

		case s := <-b.closingClients:
			b.mu.Lock()
			if _, ok := b.clients[s]; ok {
				delete(b.clients, s)
				close(s)
			}
			b.mu.Unlock()

		case event := <-b.messages:
			b.mu.Lock()
			// Append to history ring
			if len(b.history) >= b.maxHist {
				b.history = b.history[1:]
			}
			b.history = append(b.history, event)

			// Broadcast to all active clients
			for s := range b.clients {
				select {
				case s <- event:
				default:
					// Drop if client buffer is blocked
				}
			}
			b.mu.Unlock()
		}
	}
}

// Broadcast sends a LogEvent to all connected subscribers.
func (b *Broker) Broadcast(level, source, message string, details any) {
	idNum := atomic.AddUint64(&b.eventCounter, 1)
	event := models.LogEvent{
		ID:        fmt.Sprintf("evt_%d", idNum),
		Timestamp: time.Now(),
		Level:     level,
		Source:    source,
		Message:   message,
		Details:   details,
	}

	select {
	case b.messages <- event:
	default:
		// Drop message if broker queue is backed up
	}
}

// History returns a snapshot copy of the recent log events.
func (b *Broker) History() []models.LogEvent {
	b.mu.RLock()
	defer b.mu.RUnlock()
	histCopy := make([]models.LogEvent, len(b.history))
	copy(histCopy, b.history)
	return histCopy
}

// ServeHTTP handles the SSE connection from web or mobile browsers.
func (b *Broker) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "Streaming unsupported by client", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	clientChan := make(chan models.LogEvent, 20)
	b.newClients <- clientChan

	defer func() {
		b.closingClients <- clientChan
	}()

	// Send initial greeting & replay recent history
	fmt.Fprintf(w, ": connected to titanes bank simulator sse\n\n")
	flusher.Flush()

	for _, oldEvt := range b.History() {
		data, err := json.Marshal(oldEvt)
		if err == nil {
			fmt.Fprintf(w, "id: %s\nevent: log\ndata: %s\n\n", oldEvt.ID, data)
		}
	}
	flusher.Flush()

	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return

		case <-ticker.C:
			fmt.Fprintf(w, ": ping\n\n")
			flusher.Flush()

		case event, ok := <-clientChan:
			if !ok {
				return
			}
			data, err := json.Marshal(event)
			if err == nil {
				fmt.Fprintf(w, "id: %s\nevent: log\ndata: %s\n\n", event.ID, data)
				flusher.Flush()
			}
		}
	}
}
