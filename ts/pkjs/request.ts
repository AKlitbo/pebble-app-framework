/**
 * The HTTP GET every fetch on the phone goes through, shared by the app and the features it starts.
 */

/**
 * Fetches a URL with an HTTP GET and reports the result through a callback rather
 * than a promise, since that is what the fetch layer expects everywhere else.
 *
 * @param url The URL to fetch.
 * @param callback Called once with an error, or with null and the response body on success.
 */
export function request(url: string, callback: (err: string | null, body?: string) => void): void {
  const xhr = new XMLHttpRequest();

  // fire the callback exactly once. the pebble app's XHR doesn't reliably honor xhr.timeout, so
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
