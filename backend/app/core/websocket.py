"""
WebSocket connection manager for real-time job status updates.
"""
import asyncio
import json
from typing import Dict, Set, Any, Optional
from datetime import datetime, timezone
from fastapi import WebSocket
from loguru import logger


class ConnectionManager:
    """Manages WebSocket connections and broadcasts job status updates."""
    
    MAX_CONNECTIONS_PER_IP = 5

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._connections_by_ip: Dict[str, int] = {}
        self._lock = asyncio.Lock()
    
    async def connect(self, websocket: WebSocket) -> bool:
        """Accept and register a new WebSocket connection. Returns False if limit exceeded."""
        ip = websocket.client.host if websocket.client else "unknown"
        async with self._lock:
            current = self._connections_by_ip.get(ip, 0)
            if current >= self.MAX_CONNECTIONS_PER_IP:
                await websocket.close(code=4008, reason="Too many connections from this IP")
                logger.warning(f"WebSocket connection limit reached for IP {ip}")
                return False
            self._connections_by_ip[ip] = current + 1

        await websocket.accept()
        async with self._lock:
            self.active_connections.add(websocket)
        logger.debug(f"WebSocket connected. Active connections: {len(self.active_connections)}")
        return True
    
    async def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection."""
        ip = websocket.client.host if websocket.client else "unknown"
        async with self._lock:
            self.active_connections.discard(websocket)
            current = self._connections_by_ip.get(ip, 1)
            if current <= 1:
                self._connections_by_ip.pop(ip, None)
            else:
                self._connections_by_ip[ip] = current - 1
        logger.debug(f"WebSocket disconnected. Active connections: {len(self.active_connections)}")
    
    async def broadcast(self, message: Dict[str, Any]):
        """Send a message to all connected clients."""
        if not self.active_connections:
            return
        
        data = json.dumps(message, default=str)
        disconnected = set()
        
        async with self._lock:
            for connection in self.active_connections:
                try:
                    await connection.send_text(data)
                except Exception:
                    disconnected.add(connection)
            
            # Clean up dead connections
            self.active_connections -= disconnected
    
    async def send_job_started(self, job_id: str, job_name: str, details: Optional[Dict] = None):
        """Broadcast that a job has started."""
        await self.broadcast({
            "type": "job_started",
            "job_id": job_id,
            "job_name": job_name,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "details": details or {}
        })
    
    async def send_job_progress(
        self, 
        job_id: str, 
        job_name: str,
        step: str,
        progress_percent: Optional[float] = None,
        current: Optional[int] = None,
        total: Optional[int] = None,
        details: Optional[Dict] = None
    ):
        """Broadcast job progress update."""
        await self.broadcast({
            "type": "job_progress",
            "job_id": job_id,
            "job_name": job_name,
            "step": step,
            "progress_percent": progress_percent,
            "current": current,
            "total": total,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "details": details or {}
        })
    
    async def send_job_completed(self, job_id: str, job_name: str, status: str, duration: Optional[float] = None, details: Optional[Dict] = None, error: Optional[str] = None):
        """Broadcast that a job has completed."""
        await self.broadcast({
            "type": "job_completed",
            "job_id": job_id,
            "job_name": job_name,
            "status": status,
            "duration": duration,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "details": details or {},
            "error": error
        })

    @property
    def has_connections(self) -> bool:
        return len(self.active_connections) > 0


# Global connection manager instance
ws_manager = ConnectionManager()
