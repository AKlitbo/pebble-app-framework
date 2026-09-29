/**
 * Shared HTTP `request` for the live integration specs.
 *
 * Matches request() in ts/pkjs/request.ts. A 2xx passes (null, body), and a non-2xx
 * passes ('http ' + status, body) so providers can still read the error JSON the
 * upstreams return. A failed fetch comes back as a transport error. Backed by
 * Node's global fetch.
 */

/**
 * Performs an HTTP GET, shaped like request() in ts/pkjs/request.ts so the
 * providers can be exercised against the real upstream APIs.
 *
 * @param url The address to fetch.
 * @param callback Called with an error and no body on failure, or null and the body on success.
 */
export function fetchRequest(url: string, callback: (err: string | null, body?: string) => void): void {
  fetch(url)
    .then((res) => res.text().then((body) => callback(res.ok ? null : 'http ' + res.status, body)))
    .catch(() => callback('network error'));
}
