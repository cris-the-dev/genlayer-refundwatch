"""Listing, buying, the page's verdict, refunds, release to the organizer and payout settlement."""

import json

import pytest

from tests.direct.conftest import (
    CALLED_OFF,
    REF,
    HOUR,
    LISTED,
    PRICE,
    QUOTE,
    START,
    URL,
    buy,
    chain_balance,
    list_event,
    page,
    tick,
    to_hex,
    ts,
)

OTHER = "0x" + "77" * 20
DAY = 86_400
CANCEL = {"body": CALLED_OFF, "answer": "cancelled", "quote": QUOTE}


def test_list_and_buy(ev, direct_alice):
    e = ev.get_event(0)
    assert (e["organizer"].lower(), e["status"], e["sold"], e["held"]) == (to_hex(direct_alice).lower(), "ON", 3, 3 * PRICE)
    assert e["release_at"] == ts(START) + 24 * HOUR and e["lapse_at"] == e["release_at"] + 30 * DAY
    assert [t["count"] for t in ev.get_tickets(0, "", 0, 10)["items"]] == [2, 1]
    assert ev.get_readings(0, 0, 10)["items"][0]["answer"] == "none"
    assert ev.get_accounting()["expected_balance"] == 3 * PRICE


@pytest.mark.parametrize(
    "kw, msg",
    [
        ({"title": "x"}, "3-120"),
        ({"url": "ftp://x"}, "https url"),
        ({"ref": "x"}, "event identifier must be"),
        ({"ref": "SG-2030-0112", "shown": False}, "does not show event SG-2030-0112"),
        ({"starts": "2029-12-31T00:00:00Z"}, "within a year"),
        ({"price": 0}, "price above 0"),
        ({"capacity": 1001}, "capacity 1-1000"),
        ({"hold": 0}, "hold 1-720"),
        (CANCEL, "already says the event is cancelled"),
        ({"status": 404}, "unavailable (HTTP 404)"),
        ({"body": "<p>" + "x " * 11000 + "</p>"}, "over 20000 characters"),
    ],
)
def test_list_validation(ev, direct_vm, direct_alice, kw, msg):
    with direct_vm.expect_revert(msg):
        list_event(direct_vm, ev, direct_alice, **{"ref": "SG-2030-0111", **kw})
    assert ev.get_events(0, 10)["total"] == 1


# ── The source: an approved venue's host and the event's identifier ────────


@pytest.mark.parametrize(
    "url, msg",
    [
        ("https://organizer.example/spring-gala", "not an approved event source"),  # the organizer's own site
        ("https://venue.example.evil.example/gala", "not an approved event source"),  # approved name under another host
        ("https://fake-venue.example/gala", "not an approved event source"),  # approved name as a suffix
        ("https://venue.example@evil.example/gala", "https url"),  # user-info
        ("https://venue.example:8443/gala", "https url"),  # port
        ("http://venue.example/gala", "https url"),  # not https
    ],
)
def test_an_unapproved_source_is_refused_before_reading(ev, direct_vm, direct_alice, url, msg):
    with direct_vm.expect_revert(msg):
        list_event(direct_vm, ev, direct_alice, ref="SG-2030-0999", url=url)
    assert ev.get_events(0, 10)["total"] == 1


def test_an_event_identifier_is_listed_once_per_source(ev, direct_vm, direct_alice, direct_bob):
    # Another listing of the same event (even by someone else) cannot hold its own escrow.
    with direct_vm.expect_revert("event SG-2030-0110 on venue.example is already listed (#0)"):
        list_event(direct_vm, ev, direct_bob, url="https://www.venue.example/events/spring-gala")
    e = ev.get_event(0)
    assert (e["ref"], e["source"], e["source_name"]) == (REF, "venue.example", "Main Hall (test)")


def test_only_the_owner_approves_sources(ev, direct_vm, direct_alice, direct_bob):
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("not authorised"):
        ev.set_source("organizer.example", "My own page")
    direct_vm.sender = direct_alice  # the deployer
    ev.set_source("league.example", "City League")
    assert ev.get_sources() == {"venue.example": "Main Hall (test)", "league.example": "City League"}
    ev.set_source("venue.example", "")  # withdrawn for new events; event 0 keeps its page
    with direct_vm.expect_revert("not an approved event source"):
        list_event(direct_vm, ev, direct_alice, ref="SG-2030-0999")


def test_a_page_without_the_event_cannot_release_or_refund(ev, direct_vm, direct_alice, direct_bob, ledger):
    # The page now shows another event (the venue reused it): it decides nothing about this one.
    other = "<html><body><h1>Winter Gala</h1><p>Event WG-2030-1201. The Winter Gala has been cancelled.</p></body></html>"
    page(direct_vm, body=other, answer="cancelled", quote="The Winter Gala has been cancelled.")
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("does not show event SG-2030-0110"):
        ev.check(0)
    direct_vm.warp("2030-01-11T19:00:00Z")
    page(direct_vm, body=other)
    with direct_vm.expect_revert("does not show event SG-2030-0110"):
        ev.release(0)
    assert (ev.get_event(0)["status"], ledger.paid_to(direct_alice)) == ("ON", 0)
    # A validator whose copy lacks the identifier never agrees with a leader that saw it.
    page(direct_vm)
    ev.release(0)
    page(direct_vm, body=other)
    assert direct_vm.run_validator() is False


def test_buy_validation(ev, direct_vm, direct_alice, direct_bob):
    with direct_vm.expect_revert("exactly price x count"):
        buy(direct_vm, ev, direct_bob, value=PRICE + 1)
    with direct_vm.expect_revert("1-10 tickets"):
        buy(direct_vm, ev, direct_bob, count=11)
    with direct_vm.expect_revert("organizer cannot buy"):
        buy(direct_vm, ev, direct_alice)
    list_event(direct_vm, ev, direct_alice, ref="SG-2030-0111", capacity=2)
    buy(direct_vm, ev, direct_bob, event=1, count=2)
    with direct_vm.expect_revert("0 left"):
        buy(direct_vm, ev, direct_bob, event=1)
    direct_vm.warp(START)
    with direct_vm.expect_revert("sales closed"):
        buy(direct_vm, ev, direct_bob)


def test_nothing_to_refund_while_on(ev, direct_vm, direct_charlie):
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("event is ON: nothing to refund"):
        ev.refund(0)


def test_a_check_that_finds_nothing_changes_nothing(ev, direct_vm, direct_charlie):
    page(direct_vm)
    direct_vm.sender = direct_charlie
    assert ev.check(0) == "ON"
    assert ev.get_event(0)["checks"] == 1 and len(ev.get_readings(0, 0, 10)["items"]) == 2


@pytest.mark.parametrize("answer, status", [("cancelled", "CANCELLED"), ("postponed", "POSTPONED")])
def test_the_page_opens_refunds(ev, direct_vm, direct_bob, direct_charlie, ledger, answer, status):
    page(direct_vm, body=CALLED_OFF, answer=answer, quote=QUOTE)
    direct_vm.sender = direct_charlie
    assert ev.check(0) == status
    e = ev.get_event(0)
    assert (e["status"], e["quote"]) == (status, QUOTE)
    assert ev.get_readings(0, 0, 10)["items"][-1] == {"event_id": 0, "answer": answer, "quote": QUOTE, "by": to_hex(direct_charlie), "at": e["at"] + 2}
    # Anyone sends each buyer's money back, once.
    assert ev.refund(0) == 2 * PRICE and ledger.paid_to(direct_bob) == 2 * PRICE
    tick(direct_vm)
    with direct_vm.expect_revert("already refunded"):
        ev.refund(0)
    assert ev.refund(1) == PRICE and ledger.paid_to(direct_charlie) == PRICE
    assert (ev.get_event(0)["refunded"], ev.get_event(0)["held"], ev.get_accounting()["expected_balance"]) == (3, 0, 0)
    with direct_vm.expect_revert(f"event is {status}"):
        ev.check(0)
    with direct_vm.expect_revert(f"event is {status}"):
        buy(direct_vm, ev, direct_bob)


def test_a_quote_that_is_not_on_the_page_reverts(ev, direct_vm, direct_charlie):
    page(direct_vm, answer="cancelled", quote="The Spring Gala has been cancelled.")
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("quote is not on the page"):
        ev.check(0)
    assert ev.get_event(0)["status"] == "ON"


def test_only_the_organizer_cancels(ev, direct_vm, direct_alice, direct_bob, ledger):
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("not authorised"):
        ev.cancel(0)
    direct_vm.sender = direct_alice
    ev.cancel(0)
    assert ev.get_event(0)["status"] == "CANCELLED"
    direct_vm.sender = direct_bob
    assert ev.refund(0) == 2 * PRICE and ledger.paid_to(direct_bob) == 2 * PRICE


def test_release_after_the_hold(ev, direct_vm, direct_alice, direct_charlie, ledger):
    direct_vm.sender = direct_charlie
    page(direct_vm)
    direct_vm.warp("2030-01-11T18:59:59Z")
    with direct_vm.expect_revert("the hold ends 2030-01-11 19:00 UTC"):
        ev.release(0)
    direct_vm.warp("2030-01-11T19:00:00Z")
    assert ev.release(0) == "RELEASED"
    assert ledger.paid_to(direct_alice) == 3 * PRICE and ev.get_payout(0)["kind"] == "release"
    assert (ev.get_event(0)["held"], ev.get_accounting()["expected_balance"]) == (0, 0)
    with direct_vm.expect_revert("event is RELEASED"):
        ev.refund(0)


def test_release_reads_the_page_one_last_time(ev, direct_vm, direct_alice, direct_bob, ledger):
    # Cancelled after the start: the organizer is not paid; buyers are refunded.
    direct_vm.warp("2030-01-12T00:00:00Z")
    page(direct_vm, **CANCEL)
    direct_vm.sender = direct_bob
    assert ev.release(0) == "CANCELLED"
    assert ledger.paid_to(direct_alice) == 0 and ev.refund(0) == 2 * PRICE


def test_unreleased_money_goes_back_after_30_days(ev, direct_vm, direct_bob, ledger):
    # Nobody released (e.g. the page is gone): buyers are not stuck.
    direct_vm.sender = direct_bob
    direct_vm.warp("2030-02-10T19:00:00Z")
    with direct_vm.expect_revert("nothing to refund"):
        ev.refund(0)
    direct_vm.warp("2030-02-10T19:00:01Z")
    assert ev.refund(0) == 2 * PRICE and ledger.paid_to(direct_bob) == 2 * PRICE
    page(direct_vm, status=404)
    with direct_vm.expect_revert("unavailable (HTTP 404)"):
        ev.release(0)


def test_a_payout_needs_the_balance(ev, direct_vm, direct_alice, direct_bob):
    direct_vm.sender = direct_alice
    ev.cancel(0)
    chain_balance(direct_vm, PRICE)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("contract balance below payout"):
        ev.refund(0)
    assert ev.get_ticket(0)["status"] == "HELD"


# ── Consensus ───────────────────────────────────────────────────────────────


def test_validators_agree_on_the_status(ev, direct_vm, direct_charlie):
    page(direct_vm, **CANCEL)
    direct_vm.sender = direct_charlie
    ev.check(0)
    assert direct_vm.run_validator() is True
    page(direct_vm, body=CALLED_OFF, answer="postponed", quote=QUOTE)
    assert direct_vm.run_validator() is False
    page(direct_vm)  # the page another validator saw says nothing
    assert direct_vm.run_validator() is False


def test_the_quote_must_be_on_each_validators_page(ev, direct_vm, direct_charlie):
    page(direct_vm, **CANCEL)
    direct_vm.sender = direct_charlie
    ev.check(0)
    page(direct_vm, **CANCEL)
    # Other words for the same sentence agree; words the page does not have do not.
    assert direct_vm.run_validator(leader_result={"status": "cancelled", "quote": "the spring  gala has been CANCELLED"}) is True
    for bad in ({"status": "cancelled", "quote": "Gala off"}, {"status": "cancelled", "quote": "The gala is off for good."}, {"status": "none", "quote": QUOTE}, {"status": "maybe", "quote": ""}, ["cancelled"]):
        assert direct_vm.run_validator(leader_result=bad) is False


def test_an_unreachable_page_is_agreed_and_reverts(ev, direct_vm, direct_charlie):
    page(direct_vm, status=503)
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("unavailable (HTTP 503)"):
        ev.check(0)
    assert direct_vm.run_validator(leader_error="[EXTERNAL] event page unavailable (HTTP 503)") is True
    assert direct_vm.run_validator(leader_error="[EXTERNAL] event page unavailable (HTTP 404)") is False


def test_an_llm_error_is_never_agreed(ev, direct_vm, direct_charlie):
    direct_vm.clear_mocks()
    direct_vm.mock_web(r"venue\.example", {"status": 200, "body": LISTED})
    direct_vm.mock_llm(r"whether one event", json.dumps({"status": "unclear"}))
    direct_vm.sender = direct_charlie
    with direct_vm.expect_revert("expected status"):
        ev.check(0)
    assert direct_vm.run_validator(leader_error="[LLM_ERROR] expected status none, cancelled or postponed") is False


# ── Each payout settles from its own transfer ───────────────────────────────


def cancelled(ev, vm, alice, bob):
    vm.sender = alice
    ev.cancel(0)
    vm.sender = bob
    tick(vm)
    ev.refund(0)


def test_delivered_refund_settles(ev, direct_vm, direct_alice, direct_bob, chain):
    cancelled(ev, direct_vm, direct_alice, direct_bob)
    tx, fin = chain.pay(ev, 0, "refund", [0])
    assert ev.settle_payout(0, tx, fin) == "DELIVERED"
    with direct_vm.expect_revert("already settled"):
        ev.settle_payout(0, tx, fin)


def test_failed_refund_is_recoverable(ev, direct_vm, direct_alice, direct_bob, chain, ledger):
    cancelled(ev, direct_vm, direct_alice, direct_bob)
    tx, fin = chain.pay(ev, 0, "refund", [0], delivered=False)
    assert ev.settle_payout(0, tx, fin) == "FAILED"
    assert ev.get_recoverable(to_hex(direct_bob)) == 2 * PRICE
    tick(direct_vm)
    direct_vm.sender = direct_bob
    assert ev.recover(OTHER) == 2 * PRICE and ledger.paid_to(OTHER) == 2 * PRICE
    with direct_vm.expect_revert("nothing to recover"):
        ev.recover(OTHER)


@pytest.mark.parametrize(
    "kw",
    [{"method": "release"}, {"args": [1]}, {"sender": "0x" + "99" * 20}, {"at": 1}, {"result": 2}, {"delivered": None}],
)
def test_settle_rejects_a_transaction_that_is_not_this_payout(kw, ev, direct_vm, direct_alice, direct_bob, chain):
    cancelled(ev, direct_vm, direct_alice, direct_bob)
    method, a = kw.pop("method", "refund"), kw.pop("args", [0])
    tx, fin = chain.pay(ev, 0, method, a, **{"delivered": False, **kw})
    with direct_vm.expect_revert("did not create this payout"):
        ev.settle_payout(0, tx, fin)
    assert ev.get_payout(0)["status"] == "SENT"
