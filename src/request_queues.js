import _ from 'underscore';
import { checkParamOrThrow, pluckData, catchNotFoundOrThrow, parseDateFields } from './utils';

// 256s - we use more for queries pointing to DynamoDB as it may sometimes need more time to scale up.
export const REQUEST_ENDPOINTS_EXP_BACKOFF_MAX_REPEATS = 9;

/**
 * @typedef {Object} RequestOperationInfo
 * @property {Boolean} wasAlreadyPresent Indicates if request was already present in the queue.
 * @property {Boolean} wasAlreadyHandled Indicates if request was already marked as handled.
 * @property {String} requestId The ID of the added request
 */

/**
 * @typedef {Object} QueueHead
 * @property {Number} limit Maximum number of items to be returned.
 * @property {Date} queueModifiedAt Date of the last modification of the queue.
 * @property {Array} items Array of objects containing `id`, `url`, `method`, `uniqueKey` and `retryCount` attributes.
 */

/**
 * RequestQueues
 * @memberOf ApifyClient
 * @description
 * ### Basic usage
 * ```javascript
 * const ApifyClient = require('apify-client');
 *
 * const apifyClient = new ApifyClient({
 *        userId: 'RWnGtczasdwP63Mak',
 *        token: 'f5J7XsdaKDyRywwuGGo9',
 * });
 * const requestQueues = apifyClient.requestQueues;
 *
 * // Get request queue with name 'my-queue' and set it as default
 * // to be used in following commands.
 * const queue = await requestQueues.getOrCreateQueue({
 *     queueName: 'my-queue',
 * });
 * apifyClient.setOptions({ queueId: queue.id });
 *
 * // Add requests to queue.
 * await requestQueues.addRequest({ url: 'http://example.com', uniqueKey: 'http://example.com' });
 * await requestQueues.addRequest({ url: 'http://example.com/a/b', uniqueKey: 'http://example.com/a/b' });
 *
 * // Fetch unhandled requets from queue.
 * const [request1, request2] = await requestQueues.queryQueueHead();
 *
 * // Mark request as handled.
 * request1.handledAt = new Date();
 * await requestQueues.updateRequest(request1);
 * ```
 *
 * Every method can be used as either promise or with callback. If your Node version supports await/async then you can await promise result.
 * ```javascript
 * // Awaited promise
 * try {
 *      const queue = await requestQueues.getQueue(queueId);
 *      // Do something with the queue ...
 * } catch (err) {
 *      // Do something with error ...
 * }
 *
 * // Promise
 * requestQueues.getQueue(queueId)
 * .then((queue) => {
 *      // Do something with queue ...
 * })
 * .catch((err) => {
 *      // Do something with error ...
 * });
 *
 * // Callback
 * requestQueues.getQueue(queueId, (err, queue) => {
 *      // Do something with error or queue ...
 * });
 * ```
 * @namespace requestQueues
 */

export default class RequestQueues {
    constructor(httpClient) {
        this.basePath = '/v2/request-queues';
        this.client = httpClient;
    }

    _call(userOptions, endpointOptions) {
        const callOptions = this._getCallOptions(userOptions, endpointOptions);
        return this.client.call(callOptions);
    }

    _getCallOptions(userOptions, endpointOptions) {
        const { baseUrl, token } = userOptions;
        const callOptions = {
            basePath: this.basePath,
            json: true,
            expBackoffMaxRepeats: REQUEST_ENDPOINTS_EXP_BACKOFF_MAX_REPEATS,
            ...endpointOptions,
        };
        if (baseUrl) callOptions.baseUrl = baseUrl;
        if (token) callOptions.token = token;
        return callOptions;
    }

    /**
     * Creates request queue of given name and returns it's object. If queue with given name already exists then returns it's object.
     *
     * @memberof ApifyClient.requestQueues
     * @instance
     * @param {Object} options
     * @param options.token
     * @param {String} options.queueName - Custom unique name to easily identify the queue in the future.
     * @returns {RequestQueue}
     */
    async getOrCreateQueue(options) {
        const { queueName } = options;


        checkParamOrThrow(queueName, 'storeName', 'String');

        const qs = {
            name: queueName,
        };

        const endpointOptions = {
            url: '',
            method: 'POST',
            qs,
        };

        const response = await this._call(options, endpointOptions);
        return parseDateFields(pluckData(response));
    }

    /**
     * Gets list of request queues.
     *
     * By default, the objects are sorted by the createdAt field in ascending order,
     * therefore you can use pagination to incrementally fetch all queues while new ones are still being created.
     * To sort them in descending order, use desc: `true` parameter.
     * The endpoint supports pagination using limit and offset parameters and it will not return more than 1000 array elements.
     *
     * @memberof ApifyClient.requestQueues
     * @instance
     * @param {Object} options
     * @param {Number} [options.offset=0] - Number of array elements that should be skipped at the start.
     * @param {Number} [options.limit=1000] - Maximum number of array elements to return.
     * @param {Boolean} [options.desc] - If `true` then the objects are sorted by the startedAt field in descending order.
     * @param {Boolean} [options.unnamed] - If `true` then also unnamed stores will be returned. By default only named stores are returned.
     * @returns {PaginationList}
     */
    async listQueues(options) {
        const { offset, limit, desc, unnamed } = options;

        checkParamOrThrow(limit, 'limit', 'Maybe Number');
        checkParamOrThrow(offset, 'offset', 'Maybe Number');
        checkParamOrThrow(desc, 'desc', 'Maybe Boolean');
        checkParamOrThrow(unnamed, 'unnamed', 'Maybe Boolean');

        const query = {};

        if (limit) query.limit = limit;
        if (offset) query.offset = offset;
        if (desc) query.desc = 1;
        if (unnamed) query.unnamed = 1;

        const endpointOptions = {
            url: '',
            method: 'GET',
            qs: query,
        };

        const response = await this._call(options, endpointOptions);
        return parseDateFields(pluckData(response));
    }

    /**
     * Gets request queue.
     *
     * @memberof ApifyClient.requestQueues
     * @instance
     * @param {Object} options
     * @param {String} options.queueId - Unique queue ID
     * @param {String} [options.token] - Your API token at apify.com. This parameter is required
     *                                   only when using "username~queue-name" format for queueId.
     * @returns {RequestQueue}
     */
    async getQueue(options) {
        const { queueId } = options;

        checkParamOrThrow(queueId, 'queueId', 'String');

        const endpointOptions = {
            url: `/${queueId}`,
            method: 'GET',
        };

        try {
            const response = await this._call(options, endpointOptions);
            return parseDateFields(pluckData(response));
        } catch (err) {
            return catchNotFoundOrThrow(err);
        }
    }

    /**
     * Updates request queue.
     *
     * @memberof ApifyClient.queues
     * @instance
     * @param {Object} options
     * @param options.token
     * @param {String} options.queueId - Unique queue ID
     * @param {Object} options.queue
     * @param callback
     * @returns {RequestQueue}
     */
    updateQueue: (requestPromise, options) => {
        const { baseUrl, token, queueId, queue } = options;

        checkParamOrThrow(baseUrl, 'baseUrl', 'String');
        checkParamOrThrow(token, 'token', 'String');
        checkParamOrThrow(queueId, 'queueId', 'String');
        checkParamOrThrow(queue, 'queue', 'Object');

        return requestPromise({
            url: `${baseUrl}${BASE_PATH}/${queueId}`,
            json: true,
            method: 'PUT',
            qs: { token },
            body: _.omit(queue, 'id'),
        })
            .then(pluckData)
            .then(parseDateFields);
    },

    /**
     * Deletes request queue.
     *
     * @memberof ApifyClient.requestQueues
     * @instance
     * @param {Object} options
     * @param {String} options.queueId - Unique queue ID
     * @param {String} [options.token] - Your API token at apify.com. This parameter is required
     *                                   only when using "username~queue-name" format for queueId.
     * @returns {*}
     */
    async deleteQueue(options) {
        const { queueId } = options;

        checkParamOrThrow(queueId, 'queueId', 'String');

        const endpointOptions = {
            url: `/${queueId}`,
            method: 'DELETE',
        };

        const response = await this._call(options, endpointOptions);
        return parseDateFields(response);
    }

    /**
     * Adds request to the queue.
     * If request is already in the queue then returns info about existing request.
     *
     * @memberof ApifyClient.requestQueues
     * @instance
     * @param {Object} options
     * @param {String} options.queueId - Unique queue ID
     * @param {Object} options.request - Request object
     * @param {Boolean} [options.forefront] - If yes then request will be enqueued to the begining of the queue
     *                                        and to the end of the queue otherwise.
     * @param {String} [options.token] - Your API token at apify.com. This parameter is required
     *                                   only when using "username~queue-name" format for queueId.
     * @param {String} [options.clientKey] - Unique ID identifying client accessing the request queue.
     *                                      This ID is used to identify how many clients used the queue.
     *                                      This ID must be a string with length between 1 and 32 characters.
     * @returns {RequestOperationInfo}
     */
    async addRequest(options) {
        const { queueId, request, forefront = false, clientKey } = options;

        checkParamOrThrow(queueId, 'queueId', 'String');
        checkParamOrThrow(request, 'request', 'Object');
        checkParamOrThrow(forefront, 'forefront', 'Boolean');
        checkParamOrThrow(clientKey, 'clientKey', 'Maybe String');

        const query = { forefront };
        if (clientKey) query.clientKey = clientKey;

        const endpointOptions = {
            url: `${queueId}/requests`,
            method: 'POST',
            body: request,
            qs: query,
            expBackOffMaxRepeats: REQUEST_ENDPOINTS_EXP_BACKOFF_MAX_REPEATS,
        };

        const response = await this._call(options, endpointOptions);
        return parseDateFields(pluckData(response));
    }

    /**
     * Gets request from the queue.
     *
     * @memberof ApifyClient.requestQueues
     * @instance
     * @param {Object} options
     * @param {String} options.queueId - Unique queue ID
     * @param {String} options.requestId - Unique request ID
     * @param {String} [options.token] - Your API token at apify.com. This parameter is required
     *                                   only when using "username~queue-name" format for queueId.
     * @returns {Request}
     */
    async getRequest(options) {
        const { queueId, requestId, token } = options;

        checkParamOrThrow(queueId, 'queueId', 'String');
        checkParamOrThrow(requestId, 'requestId', 'String');

        const query = {};
        if (token) query.token = token;

        const endpointOptions = {
            url: `/${queueId}/requests/${requestId}`,
            method: 'GET',
            qs: query,
            expBackOffMaxRepeats: REQUEST_ENDPOINTS_EXP_BACKOFF_MAX_REPEATS,

        };

        try {
            const response = await this._call(options, endpointOptions);
            return parseDateFields(pluckData(response));
        } catch (err) {
            return catchNotFoundOrThrow(err);
        }
    }

    /**
     * Deletes request from queue.
     *
     * @memberof ApifyClient.requestQueues
     * @instance
     * @param {Object} options
     * @param {String} options.queueId - Unique queue ID
     * @param {String} options.requestId - Unique request ID
     * @param {String} [options.token] - Your API token at apify.com. This parameter is required
     *                                   only when using "username~queue-name" format for queueId.
     * @param {String} [options.clientKey] - Unique ID identifying client accessing the request queue.
     *                                      This ID is used to identify how many clients used the queue.
     *                                      This ID must be a string with length between 1 and 32 characters.
     * @returns {*}
     */
    async deleteRequest(options) {
        const { queueId, requestId, clientKey } = options;

        checkParamOrThrow(queueId, 'queueId', 'String');
        checkParamOrThrow(requestId, 'requestId', 'String');
        checkParamOrThrow(clientKey, 'clientKey', 'Maybe String');

        const query = { };
        if (clientKey) query.clientKey = clientKey;

        const endpointOptions = {
            url: `/${queueId}/requests/${requestId}`,
            method: 'DELETE',
            qs: query,
            expBackOffMaxRepeats: REQUEST_ENDPOINTS_EXP_BACKOFF_MAX_REPEATS,

        };
        const response = await this._call(options, endpointOptions);
        return parseDateFields(response);
    }

    /**
     * Updates request in the queue.
     *
     * @memberof ApifyClient.requestQueues
     * @instance
     * @param {Object} options
     * @param {String} options.queueId - Unique queue ID
     * @param {Object} options.request - Request object
     * @param {String} [options.requestId] - Unique request ID
     * @param {Boolean} [options.forefront] - If yes then request will be enqueued to the begining of the queue
     *                                        and to the end of the queue otherwise.
     * @param {String} [options.token] - Your API token at apify.com. This parameter is required
     *                                   only when using "username~queue-name" format for queueId.
     * @param {String} [options.clientKey] - Unique ID identifying client accessing the request queue.
     *                                      This ID is used to identify how many clients used the queue.
     *                                      This ID must be a string with length between 1 and 32 characters.
     * @returns {RequestOperationInfo}
     */
    async updateRequest(options) {
        const { queueId, requestId, request, forefront = false, clientKey } = options;

        checkParamOrThrow(request, 'request', 'Object');

        const safeRequestId = requestId || request.id;

        checkParamOrThrow(queueId, 'queueId', 'String');
        checkParamOrThrow(safeRequestId, 'requestId', 'String');
        checkParamOrThrow(forefront, 'forefront', 'Boolean');
        checkParamOrThrow(clientKey, 'clientKey', 'Maybe String');

        const query = { forefront };
        if (clientKey) query.clientKey = clientKey;

        const endpointOptions = {
            url: `/${queueId}/requests/${safeRequestId}`,
            method: 'PUT',
            body: request,
            qs: query,
            expBackOffMaxRepeats: REQUEST_ENDPOINTS_EXP_BACKOFF_MAX_REPEATS,
        };

        const response = await this._call(options, endpointOptions);
        return parseDateFields(pluckData(response));
    }

    /**
     * Returns given number of the first unhandled requests in he queue.
     *
     * @memberof ApifyClient.requestQueues
     * @instance
     * @param {Object} options
     * @param {String} options.queueId - Unique queue ID
     * @param {Number} options.limit - Maximum number of the items to be returned.
     * @param {String} [options.token] - Your API token at apify.com. This parameter is required
     *                                   only when using "username~queue-name" format for queueId.
     * @param {String} [options.clientKey] - Unique ID identifying client accessing the request queue.
     *                                      This ID is used to identify how many clients used the queue.
     *                                      This ID must be a string with length between 1 and 32 characters.
     * @returns {QueueHead}
     */
    async getHead(options) {
        const { queueId, limit, clientKey } = options;

        checkParamOrThrow(queueId, 'queueId', 'String');
        checkParamOrThrow(limit, 'limit', 'Number');
        checkParamOrThrow(clientKey, 'clientKey', 'Maybe String');

        const query = {};
        if (limit) query.limit = limit;
        if (clientKey) query.clientKey = clientKey;

        const endpointOptions = {
            url: `/${queueId}/head`,
            method: 'GET',
            qs: query,
            expBackOffMaxRepeats: REQUEST_ENDPOINTS_EXP_BACKOFF_MAX_REPEATS,
        };

        const response = await this._call(options, endpointOptions);
        return parseDateFields(pluckData(response));
    }
}
