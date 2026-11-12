/**
 * The HTTP GET every fetch on the phone goes through, shared by the app and the features it starts,
 * plus the JSON handling the weather and stock providers put on top of it.
 */

/**
 * The error a request answers when it is known never to have reached the provider, such as a request
 * that threw before it went out, or a plugin's fetch the wearer has not allowed. A call that answers
 * with it spent nothing, so a ledger takes its stamp back off. Every other error keeps the stamp.
 */
export const NETWORK_ERROR = 'network error';

/**
 * The error a request answers when it failed and may still have reached the provider, such as an
 * XHR error event or a plugin's failed fetch. The provider can have counted the call, so a ledger
 * keeps its stamp.
 */
export const FETCH_FAILED = 'fetch failed';

/** An HTTP GET the caller supplies, so the specs can swap in a fake. */
export type RequestFn = (url: string, callback: (err: string | null, body?: string) => void) => void;

/**
 * Fetches a URL with an HTTP GET and reports the result through a callback rather
 * than a promise, since that is what the fetch layer expects everywhere else.
 *
 * A 2xx answers null and the body, and any other status `http <status>` and the body. A request
 * that times out answers `timeout`, and one whose error event fires answers `FETCH_FAILED`, since it
 * may have reached the provider. Only a request that threw before it went out answers `NETWORK_ERROR`.
 *
 * @param url The URL to fetch.
 * @param callback Called once with an error, or with null and the response body on success.
 */
export function request(url: string, callback: (err: string | null, body?: string) => void): void {
  const xhr = new XMLHttpRequest();

  // fire the callback exactly once. the pebble app's XHR doesn't reliably honour xhr.timeout, so
  // a request can hang forever with no onload/onerror/ontimeout, which strands the whole fetch
  // (the watch just sits blank). an independent watchdog guarantees the caller always hears back
  let settled = false;
  const finish = (err: string | null, body?: string) => {
    if (settled) {
      return;
    }

    settled = true;
    clearTimeout(watchdog);

    // call back with just the error when there is no body, so a caller checking the
    // callback's arity still gets the shape it expects
    if (body === undefined) {
      callback(err);
    } else {
      callback(err, body);
    }
  };

  const watchdog = setTimeout(() => finish('timeout'), 15000);

  xhr.onload = () => {
    // 2xx is success. otherwise flag an error but still pass the body so a
    // provider can read its own error JSON
    if (xhr.status >= 200 && xhr.status < 300) {
      finish(null, xhr.responseText);
    } else {
      finish('http ' + xhr.status, xhr.responseText);
    }
  };

  // an error event comes both from a request that never left and from an answer lost on its way
  // back, and nothing here tells the two apart. it answers FETCH_FAILED, so a ledger keeps the call.
  // a phone that is truly offline then spends a stamp each time its round's wait runs out, which the
  // stock round keeps to one call a try. missing a call the provider counted could run a 25 a day plan
  // out early
  xhr.onerror = () => {
    finish(FETCH_FAILED);
  };

  xhr.ontimeout = () => {
    finish('timeout');
  };

  xhr.timeout = 15000;

  // a malformed url or a blocked send can throw synchronously, which would otherwise kill the
  // fetch before any result is delivered. nothing went out, so it answers NETWORK_ERROR, the one
  // case the face knows the request never left
  try {
    xhr.open('GET', url);
    xhr.send();
  } catch (error) {
    finish(NETWORK_ERROR);
  }
}

/**
 * Parses a JSON string, returning null on failure. The result is the raw unknown JSON, so a
 * provider casts it to its own response shape.
 *
 * @param body The raw response body to parse.
 * @return The parsed JSON, or null when the body is not valid JSON.
 */
export function safeParse(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch (error) {
    return null;
  }
}

/**
 * Adds a query param that changes on every call, so no HTTP cache between the phone and the
 * provider can hand back an old reply. Providers ignore the extra param.
 *
 * The stamp goes before any #fragment, since nothing after the # reaches the server. A signed URL,
 * such as an S3 presigned link, is refused once the stamp changes its query. That costs a feed
 * served that way, where skipping the stamp would bring back the stale copies it is here to beat,
 * and the feeds calendars hand out are not signed.
 *
 * @param url The URL to fetch.
 * @param nowMs The time to stamp it with, normally Date.now().
 * @return The URL with its `_=` stamp added.
 */
export function cacheBust(url: string, nowMs: number): string {
  const hash = url.indexOf('#');
  const base = hash === -1 ? url : url.slice(0, hash);
  const fragment = hash === -1 ? '' : url.slice(hash);
  const separator = base.indexOf('?') === -1 ? '?' : '&';

  return `${base}${separator}_=${nowMs}${fragment}`;
}

/**
 * Fetches a URL past any cache and parses the reply as JSON.
 *
 * onJson hears every reply, with the request error beside the parsed body. The body is null when
 * there was none or it did not parse. That way a provider can still read a bodyless 401 or 429 off
 * the error, and each feature picks its own status for a reply it cannot read.
 *
 * @param url The URL to fetch. A cache busting param is added before the request goes out.
 * @param get The HTTP GET to use, normally request.
 * @param onJson Called once with the request error, or null, and the parsed body, or null.
 */
export function requestJson<T = unknown>(url: string, get: RequestFn, onJson: (err: string | null, json: T | null) => void): void {
  get(cacheBust(url, Date.now()), (err, body) => {
    const json = body ? safeParse(body) : null;

    onJson(err, json ? (json as T) : null);
  });
}

/** A request about to go out for a weather reading, as a send hook hears it. */
export interface ReadingSend {
  /** The provider the request goes to: `openmeteo`, `owm`, or `weatherapi`. */
  source: string;
  /** How many calls it counts as, one for each place an Open-Meteo batch asks for. */
  calls: number;
  /** What each call weighs against the provider's limits. */
  weight: number;
}

/**
 * Hears each request a reading sends as it goes out, so a plugin can stamp it in its ledger then.
 * It can hand back a function, which hears the request's error once it answers, null for none, so a
 * request that answers `NETWORK_ERROR` can have its stamps taken back off.
 */
export type SendHook = (send: ReadingSend) => ((err: string | null) => void) | void;

/**
 * Wraps a request so a send hook hears it go out, and hears how it answered.
 *
 * @param get The HTTP GET to wrap, which should answer once and never throw, as `guardRequest` makes it.
 * @param onSend The hook, or undefined for none, which hands back `get` as it is.
 * @param send What the request counts as.
 * @return The GET, telling the hook about each request.
 */
export function heardRequest(get: RequestFn, onSend: SendHook | undefined, send: ReadingSend): RequestFn {
  if (!onSend) {
    return get;
  }

  // a hook that throws is the plugin's own code failing. it is logged and passed over, so one throw
  // cannot drop the request or stop the run from finishing
  return (url, callback) => {
    let answered: ((err: string | null) => void) | void = undefined;

    try {
      answered = onSend(send);
    } catch (error) {
      console.error(`a send hook threw: ${String(error)}`);
    }

    get(url, (err, body) => {
      if (answered) {
        try {
          answered(err);
        } catch (error) {
          console.error(`a send hook's answer threw: ${String(error)}`);
        }
      }

      callback(err, body);
    });
  };
}

/**
 * Wraps a request so it answers once, and so one that throws answers `network error` rather than
 * throwing out of the caller.
 *
 * Only the first answer goes through. A request that answers twice, or throws and then answers late,
 * has the rest dropped. A throw from the callback itself is the caller's own code failing, so that is
 * thrown on.
 *
 * @param get The HTTP GET to wrap.
 * @return The same GET, answering once, with a throw read as a request that never reached the host.
 */
export function guardRequest(get: RequestFn): RequestFn {
  return (url, callback) => {
    let answered = false;
    let callbackThrew = false;

    const answer = (err: string | null, body?: string) => {
      if (answered) {
        return;
      }

      answered = true;

      try {
        callback(err, body);
      } catch (error) {
        callbackThrew = true;
        throw error;
      }
    };

    try {
      get(url, answer);
    } catch (error) {
      if (callbackThrew) {
        throw error;
      }

      answer(NETWORK_ERROR);
    }
  };
}
