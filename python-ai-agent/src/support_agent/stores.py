"""In-memory fake back-office stores used by the example tools."""

from __future__ import annotations

import threading
from datetime import date
from typing import Literal

from pydantic import BaseModel

OrderStatus = Literal["processing", "shipped", "delivered", "cancelled"]


class Order(BaseModel):
    order_id: str
    status: OrderStatus
    carrier: str | None = None
    tracking_number: str | None = None
    estimated_delivery: date | None = None


class Ticket(BaseModel):
    ticket_id: str
    customer_email: str
    subject: str
    description: str
    priority: Literal["low", "normal", "high"]
    status: Literal["open"] = "open"


SAMPLE_ORDERS = (
    Order(
        order_id="A1001",
        status="shipped",
        carrier="ParcelPost",
        tracking_number="PP123456789",
        estimated_delivery=date(2026, 11, 4),
    ),
    Order(order_id="A1002", status="processing", estimated_delivery=date(2026, 11, 9)),
    Order(
        order_id="A1003", status="delivered", carrier="ParcelPost", tracking_number="PP987654321"
    ),
    Order(order_id="A1004", status="cancelled"),
)


class OrderStore:
    def __init__(self, orders: tuple[Order, ...] | list[Order] = SAMPLE_ORDERS) -> None:
        self._orders = {order.order_id: order for order in orders}

    def get(self, order_id: str) -> Order | None:
        return self._orders.get(order_id)


class TicketStore:
    def __init__(self) -> None:
        self._tickets: dict[str, Ticket] = {}
        self._lock = threading.Lock()

    def create(
        self,
        *,
        customer_email: str,
        subject: str,
        description: str,
        priority: Literal["low", "normal", "high"] = "normal",
    ) -> Ticket:
        with self._lock:
            ticket_id = f"T-{len(self._tickets) + 1:04d}"
            ticket = Ticket(
                ticket_id=ticket_id,
                customer_email=customer_email,
                subject=subject,
                description=description,
                priority=priority,
            )
            self._tickets[ticket_id] = ticket
        return ticket

    def all(self) -> list[Ticket]:
        with self._lock:
            return list(self._tickets.values())
