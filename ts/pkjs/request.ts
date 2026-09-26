/**
 * The HTTP GET every fetch on the phone goes through, shared by the app and the features it starts,
 * plus the JSON handling the weather and stock providers put on top of it.
 */

/** An HTTP GET the caller supplies, so the specs can swap in a fake. */
export type RequestFn = (url: string, callback: (err: string | null, body?: string) => void) => void;

/**
 * Fetches a URL with an HTTP GET and reports the result through a callback rather
 * than a promise, since that is what the fetch layer expects everywhere else.
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

  xhr.onerror = () => {
    finish('network error');
  };

  xhr.ontimeout = () => {
    finish('timeout');
  };

  xhr.timeout = 15000;

  // a malformed url or a blocked send can throw synchronously, which would otherwise kill the
  // fetch before any result is delivered. treat it as a failed request so the caller recovers
  try {
    xhr.open('GET', url);
    xhr.send();
  } catch (error) {
    finish('send error');
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
