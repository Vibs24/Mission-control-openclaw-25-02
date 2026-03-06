# ADR-002: Native WebSocket server

Use `ws` directly in API service for simple ticket update fanout.
Redis pub/sub is integration point for horizontal scaling.
