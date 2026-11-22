import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../src/api.js';
import {
  emitBetEventUpdate,
  emitMarketUpdate,
  eventEmitter,
} from '../src/events.js';

describe('GET /api/events/stream', () => {
  let server;
  let baseUrl;
  let clients;

  beforeEach(async () => {
    clients = [];
    server = createApp().listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  describe('GET /api/v1/markets/stream', () => {
    let server;
    let baseUrl;
    let clients;

    beforeEach(async () => {
      clients = [];
      server = createApp().listen(0);
      await new Promise((resolve) => server.once('listening', resolve));
      baseUrl = `http://127.0.0.1:${server.address().port}`;
    });

    afterEach(async () => {
      for (const { request } of clients) request.destroy();
      if (server) {
        await new Promise((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    });

    function connect(marketId) {
      const url = `${baseUrl}/api/v1/markets/stream?market_id=${encodeURIComponent(marketId)}`;
      return new Promise((resolve, reject) => {
        const request = http.get(url, (response) => {
          clients.push({ request, response });
          resolve({ request, response });
        });
        request.once('error', reject);
      });
    }

    function nextChunk(response) {
      return new Promise((resolve) => {
        response.once('data', (chunk) => resolve(chunk.toString()));
      });
    }

    it('sends filtered market updates and cleans up on disconnect', async () => {
      const initialListenerCount = eventEmitter.listenerCount('market_update');
      const client = await connect('market-123');
      assert.equal(client.response.headers['content-type'], 'text/event-stream');
      assert.equal(client.response.headers['x-accel-buffering'], 'no');

      const acknowledgement = await nextChunk(client.response);
      assert.match(acknowledgement, /"type":"connected"/);
      assert.equal(eventEmitter.listenerCount('market_update'), initialListenerCount + 1);

      const updatePromise = nextChunk(client.response);
      emitMarketUpdate({ marketId: 'other-market', type: 'bet_placed' });
      emitMarketUpdate({
        marketId: 'market-123',
        type: 'bet_placed',
        data: { odds: { yes: 1.5, no: 3 } },
      });
      const updateFrame = await updatePromise;
      assert.match(updateFrame, /"marketId":"market-123"/);
      assert.match(updateFrame, /"odds":\{"yes":1.5,"no":3\}/);

      const closed = new Promise((resolve) => client.response.once('close', resolve));
      client.request.destroy();
      await closed;
      const deadline = Date.now() + 1000;
      while (
        eventEmitter.listenerCount('market_update') !== initialListenerCount &&
        Date.now() < deadline
      ) {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      assert.equal(eventEmitter.listenerCount('market_update'), initialListenerCount);
    });

    it('streams bet pool and odds payloads after bet events are processed', async () => {
      const client = await connect('market-live');
      await nextChunk(client.response);

      const updatePromise = nextChunk(client.response);
      const event = {
        market_id: 'market-live',
        total_pool: 12000,
        outcome_pools: { yes: 8000, no: 4000 },
        odds: { yes: 1.5, no: 3 },
      };
      const response = await fetch(`${baseUrl}/api/v1/events/bet-placed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event),
      });

      assert.equal(response.status, 200);
      assert.equal((await response.json()).success, true);

      const frame = await updatePromise;
      const update = JSON.parse(frame.slice('data: '.length).trim());
      assert.equal(update.marketId, 'market-live');
      assert.equal(update.type, 'bet_placed');
      assert.deepEqual(update.data.odds, event.odds);
      assert.equal(update.data.total_pool, event.total_pool);
      const closed = new Promise((resolve) => client.response.once('close', resolve));
      client.request.destroy();
      await closed;
    });

    it('converts indexed bet events into market updates', () => {
      const updatePromise = new Promise((resolve) =>
        eventEmitter.once('market_update', resolve),
      );
      emitBetEventUpdate({
        function: 'bet_placed',
        contract_id: 'contract-1',
        raw_topics: ['bet_placed', 'market-1'],
        raw_data: '{"amount":"10"}',
        tx_hash: 'tx-1',
        ledger: 42,
      });

      return updatePromise.then((update) => {
        assert.equal(update.marketId, 'market-1');
        assert.equal(update.contractId, 'contract-1');
        assert.equal(update.type, 'bet_placed');
        assert.equal(update.data.tx_hash, 'tx-1');
        assert.equal(typeof update.timestamp, 'number');
      });
    });
  });

  afterEach(async () => {
    for (const { request } of clients) {
      request.destroy();
    }
    if (server) {
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  function connect() {
    return new Promise((resolve, reject) => {
      const request = http.get(`${baseUrl}/api/v1/events/stream`, (response) => {
        const client = { request, response };
        clients.push(client);
        resolve(client);
      });
      request.once('error', reject);
    });
  }

  function nextChunk(response) {
    return new Promise((resolve) => {
      response.once('data', (chunk) => resolve(chunk.toString()));
    });
  }

  async function waitForListenerCount(expected) {
    const deadline = Date.now() + 1000;
    while (
      eventEmitter.listenerCount('event') !== expected &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    assert.equal(eventEmitter.listenerCount('event'), expected);
  }

  it('streams emitted events to connected clients and cleans up on disconnect', async () => {
    const initialListenerCount = eventEmitter.listenerCount('event');
    const firstClient = await connect();
    const secondClient = await connect();

    for (const { response } of [firstClient, secondClient]) {
      assert.equal(response.headers['content-type'], 'text/event-stream');
      assert.equal(response.headers['x-accel-buffering'], 'no');
    }
    assert.equal(eventEmitter.listenerCount('event'), initialListenerCount + 2);

    const firstEvent = { seq: 1, function: 'transfer' };
    const firstClientEvent = nextChunk(firstClient.response);
    const secondClientEvent = nextChunk(secondClient.response);
    eventEmitter.emit('event', firstEvent);
    assert.equal(
      await firstClientEvent,
      `data: ${JSON.stringify(firstEvent)}\n\n`,
    );
    assert.equal(
      await secondClientEvent,
      `data: ${JSON.stringify(firstEvent)}\n\n`,
    );

    const firstClientClosed = new Promise((resolve) =>
      firstClient.response.once('close', resolve),
    );
    firstClient.request.destroy();
    await firstClientClosed;
    await waitForListenerCount(initialListenerCount + 1);

    const secondEvent = { seq: 2, function: 'approve' };
    const secondClientNextEvent = nextChunk(secondClient.response);
    eventEmitter.emit('event', secondEvent);
    assert.equal(
      await secondClientNextEvent,
      `data: ${JSON.stringify(secondEvent)}\n\n`,
    );

    const secondClientClosed = new Promise((resolve) =>
      secondClient.response.once('close', resolve),
    );
    secondClient.request.destroy();
    await secondClientClosed;
    await waitForListenerCount(initialListenerCount);
  });
});
