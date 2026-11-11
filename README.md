# RefundWatch — ticket escrow refunded when the official page calls the event off

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

When a concert, match or gala is cancelled, buyers wait weeks for the organizer
to refund, and a small organizer who has already spent the money may never do
it. **RefundWatch** keeps ticket money in escrow until the event is over. The
organizer names the official page where a cancellation would be announced (the
venue's, the league's, the airline's). Anyone can ask GenLayer validators to
read it: if it says the event is cancelled or postponed, quoted word for word,
every ticket becomes refundable and anyone can send each buyer's money back.
If the event went ahead, the organizer is paid after a hold, once validators
read the page one last time.

```
organizer ── list_event(title, url, starts_at, price, capacity, hold_hours) ─▶ RefundWatch
             validators read the page now: reachable, ≤ 20,000 characters, announces nothing yet
buyer     ── buy(event, count) + price × count            (before the start; money held here)
anyone    ── check(event): validators read the page and agree on none / cancelled / postponed,
             plus a sentence each of them finds on its own copy
             cancelled | postponed ─▶ every ticket refundable, sales closed
organizer ── cancel(event) ─▶ CANCELLED                    (same effect, no reading)
anyone    ── refund(ticket) ─▶ price × count to the buyer  (called off, or never released 30 days after the hold)
anyone    ── release(event)  after starts_at + hold_hours: one last reading;
             still nothing ─▶ RELEASED, unrefunded seats paid to the organizer
anyone    ── settle_payout(payout, tx, finalize_tx) / payee ── recover(to)
```

## Live deployment

App: https://refundwatch.cristhedev.com (events, their readings with quotes, tickets and every role's actions; source in [`app/`](app/))  
Testnet Bradbury Phase 2 (chainId 4221, GenVM v0.3): [`0x8A74b9521C9adD0B408E25d73B0614bdacac3f84`](https://explorer-bradbury.genlayer.com/address/0x8A74b9521C9adD0B408E25d73B0614bdacac3f84)

## Bradbury evidence

Run by [`tests/integration/bradbury.mjs`](tests/integration/bradbury.mjs) on Bradbury Phase 2 (all checks passed). Contract `0x8A74b9521C9adD0B408E25d73B0614bdacac3f84` (deploy [`0xa3f50e91…`](https://explorer-bradbury.genlayer.com/tx/0xa3f50e918e4c730d09a3aeb7a377f3ff351bac4716870aaf101a4c187bdb8750)), code `build/refund_watch.py` (sha256 `321aa91f…`). Organizer and two buyers are separate accounts. Pages are served from [`evidence/`](evidence/); mid-run the Spring Gala page was replaced by [`spring-gala-cancelled.html`](evidence/spring-gala-cancelled.html), and the run waited for it.

| Step | Transaction | Outcome |
|---|---|---|
| list the postponed book fair | [`0xdb859c4b…`](https://explorer-bradbury.genlayer.com/tx/0xdb859c4bf72ca2305aba5406aada06b77e230b37305b77a584e08bc4549b9b27) | reverts: the page already says the event is postponed |
| list Harbour Lights | [`0xe2737275…`](https://explorer-bradbury.genlayer.com/tx/0xe273727564eea869f230c4260fc55f5549b1ef2fa88b398b34ab9dd05b9042be) | ok: event #0, starts in 20 min, 1 h hold |
| buy 1 Harbour Lights seat | [`0x9da73072…`](https://explorer-bradbury.genlayer.com/tx/0x9da7307235400afb2d8aa3520d63dfccf10dfb738e77b973ab31b62f992745b1) | ok: 0.0001 GEN in escrow |
| release before the hold ends | [`0x5958c70a…`](https://explorer-bradbury.genlayer.com/tx/0x5958c70ae76355e9ad75599e5ff3d956facb21882e886fa05e0cfd1f4a5fb5b7) | rejected: the hold has not ended |
| list the Spring Gala | [`0x27cee6df…`](https://explorer-bradbury.genlayer.com/tx/0x27cee6dfdc21e5681ab9a8c8cff344bcde1e0e6fc36238aaa47a6e140140386d) | ok: event #1, page read: nothing announced |
| buy as the organizer | [`0x0ae39358…`](https://explorer-bradbury.genlayer.com/tx/0x0ae393589aedc209442a2518486bd167834ff62e43f1a34f8a0e4e9e8c190708) | rejected: the organizer cannot buy |
| buy 2 seats paying for 1 | [`0x29d7fb58…`](https://explorer-bradbury.genlayer.com/tx/0x29d7fb5853ded2330f966f410bd32fca743035d9f812888911960ec47223eb84) | rejected: send exactly price × count |
| buy 2 Spring Gala seats | [`0x6920ffa1…`](https://explorer-bradbury.genlayer.com/tx/0x6920ffa1b77f8002b3f7668918be0a8b17bb4df5a98b081f8ce5157dcde0b7aa) | ok: ticket #1 |
| buy 1 Spring Gala seat | [`0xf46a2220…`](https://explorer-bradbury.genlayer.com/tx/0xf46a2220fd6e885a3c9358da53f8fc40da58a912e2decd82ea01692b2af0bc7c) | ok: ticket #2 |
| refund while on | [`0x8833b51e…`](https://explorer-bradbury.genlayer.com/tx/0x8833b51e8447415deb0ac0c680595a1aa5b2d1a2749621dfb83bec85455cd44b) | rejected: event is ON, nothing to refund |
| read the page (nothing yet) | [`0x9407c199…`](https://explorer-bradbury.genlayer.com/tx/0x9407c199a9dee6a2dc925c71fb42136a48c38eda613262447438e565db4cb65f) | `none`: still ON, 3 seats in escrow |
| read the page (cancelled) | [`0xe24a38dd…`](https://explorer-bradbury.genlayer.com/tx/0xe24a38dd54371a1b1628962092c22cf6fb5a47c6cd7b64fb71977acd17f0eaaa) | **`cancelled`**, quoted: “Update from the hall: The Spring Gala has been cancelled due to storm damage to the roof of the Main Hall.” |
| buy after the cancellation | [`0x9cc47366…`](https://explorer-bradbury.genlayer.com/tx/0x9cc47366beab19917f61028d04bd4cebc9575860f1e1351381fa5232bd85f79d) | rejected: sales closed |
| refund ticket 1 (anyone sends it) | [`0x2ecee76d…`](https://explorer-bradbury.genlayer.com/tx/0x2ecee76d6b1b7bc25940005666099dcd3d2316d3f3c36e72a7a5e559a1061163) | 0.0002 GEN to the buyer = payout 0 (sent by another account) |
| refund ticket 1 again | [`0x8742e7b0…`](https://explorer-bradbury.genlayer.com/tx/0x8742e7b045ec60b7f540465dc3d3ba71429215824ceda978cff1e908dba7a2cc) | rejected: already refunded |
| refund ticket 2 | [`0x8cc8f8dd…`](https://explorer-bradbury.genlayer.com/tx/0x8cc8f8ddefc18c5f974347cff16ece4c0c9cacb0e2a9da524dc73020abae76e5) | 0.0001 GEN to the buyer = payout 1 |
| list Quiz Night | [`0xa1f19103…`](https://explorer-bradbury.genlayer.com/tx/0xa1f19103482ad7d2f55996593848c76b0f240b69a1747b3c2ee97816b98c695f) | ok: event #2 |
| buy 1 Quiz Night seat | [`0x4ef15afa…`](https://explorer-bradbury.genlayer.com/tx/0x4ef15afaf3dac9591b769ba67d2386f6e14ea4332d5f6d6de194cc3c388b6e77) | ok: ticket #3 |
| cancel as a buyer | [`0xff2f7869…`](https://explorer-bradbury.genlayer.com/tx/0xff2f7869f51b90911f76b3405a33167ea25a774cb1e131c3cc3bd0091e70c827) | rejected: organizer only |
| cancel Quiz Night | [`0xf5051969…`](https://explorer-bradbury.genlayer.com/tx/0xf5051969d8c00dba8dcd444aaccd44456418d8f9c2ad5c72a8e44a39b127e519) | CANCELLED by the organizer |
| refund the Quiz Night ticket | [`0x8e1b79fb…`](https://explorer-bradbury.genlayer.com/tx/0x8e1b79fbd188026a9f692af69ac1e6ef9611d2989db9d5ecc75f868cc7cf7cbf) | 0.0001 GEN to the buyer = payout 2 |
| release Harbour Lights | [`0x6e0660d5…`](https://explorer-bradbury.genlayer.com/tx/0x6e0660d502f340a7f6fc3465fcfec808488c71dab81390472dc62b1ca38ff88a) | **after the hold, one last reading: `none`, RELEASED**, 0.0001 GEN to the organizer = payout 3 |

Every payout was settled from its own transfer once the paying transaction finalized:

| Payout | Kind | Paid by | Finalized by | `settle_payout` | Result |
|---|---|---|---|---|---|
| 0 | refund → buyer (Spring Gala, 2 seats) | [`0x2ecee76d…`](https://explorer-bradbury.genlayer.com/tx/0x2ecee76d6b1b7bc25940005666099dcd3d2316d3f3c36e72a7a5e559a1061163) | [`0xcec0b46c…`](https://explorer-bradbury.genlayer.com/tx/0xcec0b46ceecd7ad4408bed4bc07bbe3c46bab2ca6751323de0e36793d8afa07c) | [`0xfb7e618b…`](https://explorer-bradbury.genlayer.com/tx/0xfb7e618b74ecca530bd5f85400d59395e624cfce1ca8e8f8f843bbcae1ca1091) | DELIVERED |
| 1 | refund → buyer (Spring Gala, 1 seat) | [`0x8cc8f8dd…`](https://explorer-bradbury.genlayer.com/tx/0x8cc8f8ddefc18c5f974347cff16ece4c0c9cacb0e2a9da524dc73020abae76e5) | [`0xb8560404…`](https://explorer-bradbury.genlayer.com/tx/0xb85604048d497bfa2a86b46a80aad0d1acff778f80acc22be926c669c240d445) | [`0xa64c8701…`](https://explorer-bradbury.genlayer.com/tx/0xa64c8701594fc277b9f68b01d977b9b1fabfdc113835bc0964aa928e249b1679) | DELIVERED |
| 2 | refund → buyer (Quiz Night) | [`0x8e1b79fb…`](https://explorer-bradbury.genlayer.com/tx/0x8e1b79fbd188026a9f692af69ac1e6ef9611d2989db9d5ecc75f868cc7cf7cbf) | [`0x0a20c9ac…`](https://explorer-bradbury.genlayer.com/tx/0x0a20c9ac2889ed5b88e89582cbc0b5698a9f9bfd3efb8e40204c3b9b215066cd) | [`0x5111b0a2…`](https://explorer-bradbury.genlayer.com/tx/0x5111b0a28124c66037725cc4fd6e3132866ae8a2f89c1edfc14e78a5285d9533) | DELIVERED |
| 3 | release → organizer (Harbour Lights) | [`0x6e0660d5…`](https://explorer-bradbury.genlayer.com/tx/0x6e0660d502f340a7f6fc3465fcfec808488c71dab81390472dc62b1ca38ff88a) | [`0x6fd6cf3f…`](https://explorer-bradbury.genlayer.com/tx/0x6fd6cf3f35896b701f8aa83a98b653bcde5111b41d46b79a5bf86ecd1a078d96) | [`0x3a0ff4ef…`](https://explorer-bradbury.genlayer.com/tx/0x3a0ff4efb359589b65e046587c73468fc4edf42ec2635a1d644741b3d0da146e) | DELIVERED |

Settling the same payout again is rejected ([`0xc322f803…`](https://explorer-bradbury.genlayer.com/tx/0xc322f803d21f556258921053eba2535c4bd19184d59c2a409e5578203c04095b), [`0xe8e214b6…`](https://explorer-bradbury.genlayer.com/tx/0xe8e214b6a900c53eeb0760c7d5dc73e92108960035d733407f26cfc44847af71), [`0xf4eed09c…`](https://explorer-bradbury.genlayer.com/tx/0xf4eed09c6a763f41a3e1aeb9ba4597d70496fc2dfd535fcfde1e4630a39d6012), [`0x22b6a42a…`](https://explorer-bradbury.genlayer.com/tx/0x22b6a42a278feafd4186cc08b58d0794e897a440e5c86781c22412098d67fcde)). Afterwards `get_accounting` reports `unaccounted: 0.0003` GEN: exactly the value attached to the three rejected payable transactions (organizer's buy, the underpaid buy, the buy after the cancellation). On Bradbury a reverted payable transaction leaves its value in the contract; the contract never recorded it, so no one can withdraw it, and the E2E counts it explicitly.

## How the page is read

1. **The official page, whole.** Each validator fetches the URL itself
   (served HTML, no JavaScript). Visible text over 20,000 characters is
   refused at listing, never cut, so a cancellation at the bottom of a long
   page is never missed. A page that cannot be fetched reverts the reading;
   it is never taken as "nothing announced".
2. **One narrow question.** The LLM sees the event's title and start time and
   the page, fenced as data, and answers `none`, `cancelled` or `postponed`.
   Rumours, "may be cancelled" and other events on the same page are `none`.
3. **Quoted, then checked by text.** A `cancelled` or `postponed` answer must
   copy the sentence that says so. The contract checks the quote is on the
   page (ignoring case, spacing and markup); a quote that is not there is an
   LLM error and reverts.
4. **Consensus on the status.** Every validator reads the page itself and
   accepts the leader's result only if its own answer is the same status and
   the leader's quote is on its own copy. An unreachable page is agreed on only
   when a validator reproduces the error; an LLM error never is.
5. **Listing reads first.** A page that already announces a cancellation or
   postponement cannot be listed, so a reading that later says so is news.

## Where the money goes

- Ticket money stays in the contract from `buy` until it leaves one way:
  - **refund** to the buyer (price × seats), sent by anyone, once the event is
    `CANCELLED` or `POSTPONED`, or if it is still `ON` 30 days after its hold
    ended (nobody released it, for example because the page went away).
  - **release** to the organizer, for every seat not refunded, after
    `starts_at + hold_hours` and one last reading that still finds nothing.
- Postponed counts as called off: a buyer takes the money back rather than a
  new date they may not be able to make.
- The organizer cannot buy their own seats; sales close at the start or when
  the event is called off. 1–10 seats per purchase, `price × count` exactly.
- Each paying transaction has one payee.

## Payments and settlement

Every transfer is a recorded payout (with its sender and creation time). A
payout is judged by its own transfer, never by the contract balance:
`settle_payout(payout_id, tx_hash, finalize_tx)` has validators read the paying
transaction (it must be this contract's `refund` for that ticket, its
`release` for that event or a `recover`, sent by the recorded sender at the
recorded time, and finalized with a successful result) and the consensus
transaction that finalized it, and check that the transfer to the payee was
executed. Delivered payouts are `DELIVERED`; a failed one is `FAILED` and its
amount becomes recoverable by the payee, who sends it anywhere with `recover`.
`get_accounting` (balance vs. `expected_balance`) is informational only.

## Limits

- The page decides. An organizer who names their own page could leave a
  cancellation off it; the listing form asks for the venue's or league's page,
  and buyers see which page it is before paying. If nobody can release the
  money, buyers get it back 30 days after the hold.
- Pages are fetched as served; a page built by JavaScript reads as empty text
  and is likely to be read as `none`.
- A cancellation posted after the release is too late: the organizer was paid.
  The hold (1–720 hours after the start) is the organizer's promise of how long
  buyers have to see it.

## The app

https://refundwatch.cristhedev.com ([`app/`](app/)) reads the **finalized**
state and treats a write as done only when it is `FINALIZED` with
`FINISHED_WITH_RETURN` **and** reading the contract back shows the change.
Each event shows its official page, escrow, the time the organizer can be
paid, every reading with its quote, and its tickets. Buy appears before the
start with the seats left; release only after the hold; a refund button per
held ticket only once the event is called off or the money lapsed; cancel only
for the organizer. GEN amounts use BigInt only. "Settle" finds the paying
transaction and looks up its finalization from the `TransactionFinalized` log.
`node app/check-actions.mjs app/index.html` (CI) asserts the controls per role,
event state and time, escaping, and exact money formatting.

## API

| Method | Who | Notes |
|---|---|---|
| `list_event(title, url, starts_at, price, capacity, hold_hours)` | organizer | start within a year; price > 0; capacity 1–1,000; hold 1–720 h; reads the page |
| `buy(event_id, count)` payable | anyone but the organizer | before the start, 1–10 seats, exactly `price × count` |
| `check(event_id)` | anyone | reads the page; returns the status |
| `cancel(event_id)` | organizer | every ticket refundable |
| `refund(ticket_id)` | anyone | pays the buyer; called off, or `ON` past `lapse_at` |
| `release(event_id)` | anyone | after `release_at`; reads the page; pays the organizer if still nothing |
| `settle_payout(payout_id, tx_hash, finalize_tx)` / `recover(to)` | anyone / payee | |
| `get_event`, `get_events(start, limit)`, `get_ticket`, `get_tickets(event_id or -1, buyer or "", start, limit)`, `get_readings(event_id, start, limit)`, `get_payout`, `get_payouts(start, limit, only_unsettled)`, `get_accounting`, `get_recoverable` | view | |

## Run

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
genvm-lint check contracts/refund_watch.py
pytest tests/direct -v                         # 33 tests
# end-to-end on Bradbury Phase 2, against the packed code (keys in GL_PK0..2)
python deploy/shrink.py contracts/refund_watch.py build/refund_watch.py --pack
npm i genlayer-js@2.0.0-rc.2   # plus the fee-estimate patch in app/README.md
node tests/integration/bradbury.mjs build/refund_watch.py
```

Bradbury rejects deploys above ~20 KB of code; deploy the output of
`deploy/shrink.py` (AST-checked, 30.8 KB → 8.4 KB packed). CI re-runs all
direct tests against the packed code. The E2E pages are in
[`evidence/`](evidence/), served at `https://refundwatch.cristhedev.com/evidence/`;
the Spring Gala page is replaced by `spring-gala-cancelled.html` mid-run.

## Tests (33 direct, Bradbury E2E)

- **Listing and buying** — validation of title, url, start, price, capacity and hold; a page already announcing a cancellation cannot be listed; exact payment, seat cap, no buying by the organizer or after the start.
- **The page decides** — nothing refundable while the page says nothing; a reading that finds nothing changes nothing; cancelled and postponed both open refunds and close sales; a quote that is not on the page reverts.
- **Organizer** — only the organizer cancels; release refused before the hold ends (to the second), pays every unrefunded seat after it, and reads the page one last time (a late cancellation refunds buyers instead).
- **Lapse** — money never released goes back to buyers after 30 days (boundary to the second); no payout beyond the contract balance.
- **Consensus (validator replay)** — agreement on the status, the quote must be on each validator's own copy (case and spacing ignored), an unreachable page is agreed and reverts, an LLM error is never agreed.
- **Settlement** — delivered and failed refunds, recovery to another address; wrong method, args, sender, time, result, or a transaction that sent nothing are rejected and the payout stays `SENT`.
- **App** — `check-actions.mjs`: controls per role, event state and time, refund amounts per ticket, escaping, exact GEN amounts beyond 2^53.

## License

MIT
