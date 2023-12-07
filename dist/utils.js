"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cast = exports.PaginationIterator = exports.getVersionData = exports.isStream = exports.isBuffer = exports.isNode = exports.maybeGzipValue = exports.stringifyWebhooksToBase64 = exports.parseDateFields = exports.catchNotFoundOrThrow = exports.pluckData = void 0;
const tslib_1 = require("tslib");
const util_1 = tslib_1.__importDefault(require("util"));
const zlib_1 = tslib_1.__importDefault(require("zlib"));
const ow_1 = tslib_1.__importDefault(require("ow"));
const PARSE_DATE_FIELDS_MAX_DEPTH = 3; // obj.data.someArrayField.[x].field
const PARSE_DATE_FIELDS_KEY_SUFFIX = 'At';
const NOT_FOUND_STATUS_CODE = 404;
const RECORD_NOT_FOUND_TYPE = 'record-not-found';
const RECORD_OR_TOKEN_NOT_FOUND_TYPE = 'record-or-token-not-found';
const MIN_GZIP_BYTES = 1024;
/**
 * Returns object's 'data' property or throws if parameter is not an object,
 * or an object without a 'data' property.
 */
function pluckData(obj) {
    if (typeof obj === 'object' && obj) {
        if (typeof obj.data !== 'undefined')
            return obj.data;
    }
    throw new Error(`Expected response object with a "data" property, but received: ${obj}`);
}
exports.pluckData = pluckData;
/**
 * If given HTTP error has NOT_FOUND_STATUS_CODE status code then returns undefined.
 * Otherwise rethrows error.
 */
function catchNotFoundOrThrow(err) {
    const isNotFoundStatus = err.statusCode === NOT_FOUND_STATUS_CODE;
    const isNotFoundMessage = err.type === RECORD_NOT_FOUND_TYPE || err.type === RECORD_OR_TOKEN_NOT_FOUND_TYPE;
    const isNotFoundError = isNotFoundStatus && isNotFoundMessage;
    if (!isNotFoundError)
        throw err;
}
exports.catchNotFoundOrThrow = catchNotFoundOrThrow;
/**
 * Helper function that traverses JSON structure and parses fields such as modifiedAt or createdAt to dates.
 */
function parseDateFields(input, depth = 0) {
    if (depth > PARSE_DATE_FIELDS_MAX_DEPTH)
        return input;
    if (Array.isArray(input))
        return input.map((child) => parseDateFields(child, depth + 1));
    if (!input || typeof input !== 'object')
        return input;
    return Object.entries(input).reduce((output, [k, v]) => {
        const isValObject = !!v && typeof v === 'object';
        if (k.endsWith(PARSE_DATE_FIELDS_KEY_SUFFIX)) {
            if (v) {
                const d = new Date(v);
                output[k] = Number.isNaN(d.getTime()) ? v : d;
            }
            else {
                output[k] = v;
            }
        }
        else if (isValObject || Array.isArray(v)) {
            output[k] = parseDateFields(v, depth + 1);
        }
        else {
            output[k] = v;
        }
        return output;
    }, {});
}
exports.parseDateFields = parseDateFields;
/**
 * Helper function that converts array of webhooks to base64 string
 */
function stringifyWebhooksToBase64(webhooks) {
    if (!webhooks)
        return;
    const webhooksJson = JSON.stringify(webhooks);
    if (isNode()) {
        return Buffer.from(webhooksJson, 'utf8').toString('base64');
    }
    const encoder = new TextEncoder();
    const uint8Array = encoder.encode(webhooksJson);
    return btoa(String.fromCharCode(...uint8Array));
}
exports.stringifyWebhooksToBase64 = stringifyWebhooksToBase64;
let gzipPromise;
if (isNode())
    gzipPromise = util_1.default.promisify(zlib_1.default.gzip);
/**
 * Gzip provided value, otherwise returns undefined.
 */
async function maybeGzipValue(value) {
    if (!isNode())
        return;
    if (typeof value !== 'string' && !Buffer.isBuffer(value))
        return;
    // Request compression is not that important so let's
    // skip it instead of throwing for unsupported types.
    const areDataLargeEnough = Buffer.byteLength(value) >= MIN_GZIP_BYTES;
    if (areDataLargeEnough) {
        return gzipPromise(value);
    }
    return undefined;
}
exports.maybeGzipValue = maybeGzipValue;
function isNode() {
    return !!(typeof process !== 'undefined' && process.versions && process.versions.node);
}
exports.isNode = isNode;
function isBuffer(value) {
    return ow_1.default.isValid(value, ow_1.default.any(ow_1.default.buffer, ow_1.default.arrayBuffer, ow_1.default.typedArray));
}
exports.isBuffer = isBuffer;
function isStream(value) {
    return ow_1.default.isValid(value, ow_1.default.object.hasKeys('on', 'pipe'));
}
exports.isStream = isStream;
function getVersionData() {
    if (typeof BROWSER_BUILD !== 'undefined') {
        return { version: VERSION };
    }
    // eslint-disable-next-line
    return require('../package.json');
}
exports.getVersionData = getVersionData;
/**
 * Helper class to create async iterators from paginated list endpoints with exclusive start key.
 */
class PaginationIterator {
    constructor(options) {
        Object.defineProperty(this, "maxPageLimit", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "getPage", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "limit", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "exclusiveStartId", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.maxPageLimit = options.maxPageLimit;
        this.limit = options.limit;
        this.exclusiveStartId = options.exclusiveStartId;
        this.getPage = options.getPage;
    }
    async *[Symbol.asyncIterator]() {
        let nextPageExclusiveStartId;
        let iterateItemCount = 0;
        while (true) {
            const pageLimit = this.limit ? Math.min(this.maxPageLimit, this.limit - iterateItemCount) : this.maxPageLimit;
            const pageExclusiveStartId = nextPageExclusiveStartId || this.exclusiveStartId;
            const page = await this.getPage({
                limit: pageLimit,
                exclusiveStartId: pageExclusiveStartId,
            });
            // There are no more pages to iterate
            if (page.items.length === 0)
                return;
            yield page;
            iterateItemCount += page.items.length;
            // Limit reached stopping to iterate
            if (this.limit && iterateItemCount >= this.limit)
                return;
            nextPageExclusiveStartId = page.items[page.items.length - 1].id;
        }
    }
}
exports.PaginationIterator = PaginationIterator;
function cast(input) {
    return input;
}
exports.cast = cast;
//# sourceMappingURL=utils.js.map