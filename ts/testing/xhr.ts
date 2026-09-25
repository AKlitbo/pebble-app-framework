/**
 * A stand-in XMLHttpRequest for the specs that drive code which opens its own requests.
 *
 * Every request opened is recorded, so a spec can read the url it went to and then answer it,
 * fail it, time it out, or leave it hanging. Nothing touches the network.
 */

/** A request the code under test opened, with the handlers it hung on it and the calls that fire them. */
export interface FakeXhr {
  method: string;
  url: string;
  status: number;
  responseText: string;
  timeout: number;
  onload?: () => void;
  onerror?: () => void;
  ontimeout?: () => void;
  respond(status: number, body: string): void;
  fail(): void;
  timeOut(): void;
}

/**
 * Swaps the global XMLHttpRequest for the fake.
 *
 * @param onSend Runs as each request is sent, so a spec can make the send itself throw.
 * @return Every request sent so far, in the order they were opened.
 */
export function installFakeXhr(onSend?: () => void): FakeXhr[] {
  const sent: FakeXhr[] = [];

  class Fake implements FakeXhr {
    method = '';
    url = '';
    status = 0;
    responseText = '';
    timeout = 0;
    onload?: () => void;
    onerror?: () => void;
    ontimeout?: () => void;

    open(method: string, url: string) {
      this.method = method;
      this.url = url;
    }

    send() {
      sent.push(this);
      onSend?.();
    }

    respond(status: number, body: string) {
      this.status = status;
      this.responseText = body;
      this.onload?.();
    }

    fail() {
      this.onerror?.();
    }

    timeOut() {
      this.ontimeout?.();
    }
  }

  globalThis.XMLHttpRequest = Fake as unknown as typeof XMLHttpRequest;
  return sent;
}
