/*
 * #%L
 * %%
 * Copyright (C) 2011 - 2017 BMW Car IT GmbH
 * %%
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *      http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * #L%
 */
const MulticastWildcardRegexFactory = require("../util/MulticastWildcardRegexFactory");
const DiagnosticTags = require("../../system/DiagnosticTags");
const LoggingManager = require("../../system/LoggingManager");
const InProcessAddress = require("../inprocess/InProcessAddress");
const JoynrMessage = require("../JoynrMessage");
const MessageReplyToAddressCalculator = require("../MessageReplyToAddressCalculator");
const JoynrException = require("../../exceptions/JoynrException");
const JoynrRuntimeException = require("../../exceptions/JoynrRuntimeException");
const Typing = require("../../util/Typing");
const UtilInternal = require("../../util/UtilInternal");
const JSONSerializer = require("../../util/JSONSerializer");

/**
 * Message Router receives a message and forwards it to the correct endpoint, as looked up in the {@link RoutingTable}
 *
 * @constructor
 * @name MessageRouter
 *
 * @param {Object}
 *            settings the settings object holding dependencies
 * @param {RoutingTable}
 *            settings.routingTable
 * @param {MessagingStubFactory}
 *            settings.messagingStubFactory
 * @param {String}
 *            settings.myChannelId
 * @param {Address} settings.incomingAddress
 * @param {Address} settings.parentMessageRouterAddress
 * @param {LocalStorage} settings.persistency - LocalStorage or another object implementing the same interface
 *
 * @classdesc The <code>MessageRouter</code> is a joynr internal interface. The Message
 * Router receives messages from Message Receivers, and forwards them along using to the
 * appropriate Address, either <code>{@link ChannelAddress}</code> for messages being
 * sent to a joynr channel via HTTP, <code>{@link BrowserAddress}</code> for messages
 * going to applications running within a seperate browser tab, or
 * <code>{@link InProcessAddress}</code> for messages going to a dispatcher running
 * within the same JavaScript scope as the MessageRouter.
 *
 * MessageRouter is part of the cluster controller, and is used for
 * internal messaging only.
 */
function MessageRouter(settings) {
    // TODO remote provider participants are registered by capabilitiesDirectory on lookup
    // TODO local providers registered (using dispatcher as local endpoint) by capabilitiesDirectory on register
    // TODO local replyCallers are registered (using dispatcher as local endpoint) when they are created

    const that = this;
    const multicastWildcardRegexFactory = new MulticastWildcardRegexFactory();
    const log = LoggingManager.getLogger("joynr/messaging/routing/MessageRouter");
    let routingProxy, messagingStub;
    let queuedAddNextHopCalls = [],
        queuedRemoveNextHopCalls = [],
        queuedAddMulticastReceiverCalls = [],
        queuedRemoveMulticastReceiverCalls = [];
    const routingTable = settings.initialRoutingTable || {};
    const id = settings.joynrInstanceId;
    const persistency = settings.persistency;
    const incomingAddress = settings.incomingAddress;
    const parentMessageRouterAddress = settings.parentMessageRouterAddress;
    const multicastAddressCalculator = settings.multicastAddressCalculator;
    const messagingSkeletonFactory = settings.messagingSkeletonFactory;
    const multicastReceiversRegistry = {};
    let replyToAddress;
    const messageReplyToAddressCalculator = new MessageReplyToAddressCalculator({});
    const messagesWithoutReplyTo = [];

    // if (settings.routingTable === undefined) {
    // throw new Error("routing table is undefined");
    // }
    if (settings.parentMessageRouterAddress !== undefined && settings.incomingAddress === undefined) {
        throw new Error("incoming address is undefined");
    }
    if (settings.messagingStubFactory === undefined) {
        throw new Error("messaging stub factory is undefined");
    }
    if (settings.messageQueue === undefined) {
        throw new Error("messageQueue is undefined");
    }

    let started = true;

    let getAddressFromPersistency = function getAddressFromPersistency(participantId) {
        let addressString;
        try {
            addressString = persistency.getItem(that.getStorageKey(participantId));
            if (addressString === undefined || addressString === null || addressString === "{}") {
                persistency.removeItem(that.getStorageKey(participantId));
            } else {
                const address = Typing.augmentTypes(JSON.parse(addressString));
                routingTable[participantId] = address;
                return address;
            }
        } catch (error) {
            log.error(`Failed to get address from persisted routing entries for participant ${participantId}`);
        }
    };

    if (!persistency) {
        getAddressFromPersistency = UtilInternal.emptyFunction;
    }

    function isReady() {
        return started;
    }

    /**
     * @function MessageRouter#setReplyToAddress
     *
     * @param {String} newAddress - the address to be used as replyTo  address
     *
     * @returns void
     */
    this.setReplyToAddress = function(newAddress) {
        replyToAddress = newAddress;
        messageReplyToAddressCalculator.setReplyToAddress(replyToAddress);
        messagesWithoutReplyTo.forEach(that.route);
    };

    /**
     * @function MessageRouter#getStorageKey
     *
     * @param {String} participantId
     *
     * @returns {String} the storage key
     */
    this.getStorageKey = function getStorageKey(participantId) {
        return `${id}_${participantId}`;
    };

    /**
     * @function MessageRouter#removeNextHop
     *
     * @param {String} participantId
     *
     * @returns {Promise} promise
     */
    this.removeNextHop = function removeNextHop(participantId) {
        if (!isReady()) {
            log.debug("removeNextHop: ignore call as message router is already shut down");
            return Promise.reject(new Error("message router is already shut down"));
        }

        routingTable[participantId] = undefined;
        if (persistency) {
            persistency.removeItem(that.getStorageKey(participantId));
        }

        if (routingProxy !== undefined) {
            return routingProxy.removeNextHop({
                participantId
            });
        }
        if (parentMessageRouterAddress !== undefined) {
            const deferred = UtilInternal.createDeferred();
            queuedRemoveNextHopCalls.push({
                participantId,
                resolve: deferred.resolve,
                reject: deferred.reject
            });
            return deferred.promise;
        }
        return Promise.resolve();
    };

    // helper functions for setRoutingProxy
    function getReplyToAddressOnError(error) {
        throw new Error(
            `Failed to get replyToAddress from parent router: ${error}${
                error instanceof JoynrException ? ` ${error.detailMessage}` : ""
            }`
        );
    }

    /**
     * @function MessageRouter#addNextHopToParentRoutingTable
     *
     * @param {String} participantId
     * @param {boolean} isGloballyVisible
     *
     * @returns {Promise} promise
     */
    this.addNextHopToParentRoutingTable = function addNextHopToParentRoutingTable(participantId, isGloballyVisible) {
        if (Typing.getObjectType(incomingAddress) === "WebSocketClientAddress") {
            return routingProxy.addNextHop({
                participantId,
                webSocketClientAddress: incomingAddress,
                isGloballyVisible
            });
        }
        if (Typing.getObjectType(incomingAddress) === "BrowserAddress") {
            return routingProxy.addNextHop({
                participantId,
                browserAddress: incomingAddress,
                isGloballyVisible
            });
        }
        if (Typing.getObjectType(incomingAddress) === "WebSocketAddress") {
            return routingProxy.addNextHop({
                participantId,
                webSocketAddress: incomingAddress,
                isGloballyVisible
            });
        }
        if (Typing.getObjectType(incomingAddress) === "ChannelAddress") {
            return routingProxy.addNextHop({
                participantId,
                channelAddress: incomingAddress,
                isGloballyVisible
            });
        }

        const errorMsg = `Invalid address type of incomingAddress: ${Typing.getObjectType(incomingAddress)}`;
        log.fatal(errorMsg);
        return Promise.reject(new JoynrRuntimeException({ detailMessage: errorMsg }));
    };

    function handleAddNextHopToParentError(error) {
        if (!isReady()) {
            //in this case, the error is expected, e.g. during shut down
            log.debug(
                `Adding routingProxy.proxyParticipantId ${
                    routingProxy.proxyParticipantId
                }failed while the message router is not ready. Error: ${error.message}`
            );
            return;
        }
        throw new Error(error);
    }
    function addRoutingProxyToParentRoutingTable() {
        if (routingProxy.proxyParticipantId !== undefined) {
            // isGloballyVisible is false because the routing provider is local
            const isGloballyVisible = false;
            return that
                .addNextHopToParentRoutingTable(routingProxy.proxyParticipantId, isGloballyVisible)
                .catch(handleAddNextHopToParentError);
        }
    }
    function processQueuedRoutingProxyCalls() {
        let hopIndex, receiverIndex, queuedCall, length;

        length = queuedAddNextHopCalls.length;
        for (hopIndex = 0; hopIndex < length; hopIndex++) {
            queuedCall = queuedAddNextHopCalls[hopIndex];
            if (queuedCall.participantId !== routingProxy.proxyParticipantId) {
                that.addNextHopToParentRoutingTable(queuedCall.participantId, queuedCall.isGloballyVisible)
                    .then(queuedCall.resolve)
                    .catch(queuedCall.reject);
            }
        }
        length = queuedRemoveNextHopCalls.length;
        for (hopIndex = 0; hopIndex < length; hopIndex++) {
            queuedCall = queuedRemoveNextHopCalls[hopIndex];
            that.removeNextHop(queuedCall.participantId)
                .then(queuedCall.resolve)
                .catch(queuedCall.reject);
        }
        length = queuedAddMulticastReceiverCalls.length;
        for (receiverIndex = 0; receiverIndex < length; receiverIndex++) {
            queuedCall = queuedAddMulticastReceiverCalls[receiverIndex];
            routingProxy
                .addMulticastReceiver(queuedCall.parameters)
                .then(queuedCall.resolve)
                .catch(queuedCall.reject);
        }
        length = queuedRemoveMulticastReceiverCalls.length;
        for (receiverIndex = 0; receiverIndex < length; receiverIndex++) {
            queuedCall = queuedRemoveMulticastReceiverCalls[receiverIndex];
            routingProxy
                .removeMulticastReceiver(queuedCall.parameters)
                .then(queuedCall.resolve)
                .catch(queuedCall.reject);
        }
        queuedAddNextHopCalls = undefined;
        queuedRemoveNextHopCalls = undefined;
        queuedAddMulticastReceiverCalls = undefined;
        queuedRemoveMulticastReceiverCalls = undefined;
        return null;
    }
    /**
     * @function MessageRouter#setRoutingProxy
     *
     * @param {RoutingProxy} newRoutingproxy - the routing proxy to be set
     * @returns {Object} A+ promise object
     */
    this.setRoutingProxy = function setRoutingProxy(newRoutingProxy) {
        routingProxy = newRoutingProxy;

        if (routingProxy === undefined) {
            return Promise.resolve(); // TODO resolve or reject???
        }

        return addRoutingProxyToParentRoutingTable()
            .then(routingProxy.replyToAddress.get)
            .then(that.setReplyToAddress)
            .catch(getReplyToAddressOnError)
            .then(processQueuedRoutingProxyCalls);
    };

    /*
     * This method is called when no address can be found in the local routing table.
     *
     * It tries to resolve the next hop from the persistency and parent router.
     */
    function resolveNextHopInternal(participantId) {
        const address = getAddressFromPersistency(participantId);

        function resolveNextHopOnSuccess(opArgs) {
            if (opArgs.resolved) {
                routingTable[participantId] = parentMessageRouterAddress;
                return parentMessageRouterAddress;
            }
            throw new Error(
                `nextHop cannot be resolved, as participant with id ${participantId} is not reachable by parent routing table`
            );
        }

        if (address === undefined && routingProxy !== undefined) {
            return routingProxy
                .resolveNextHop({
                    participantId
                })
                .then(resolveNextHopOnSuccess);
        }
        return Promise.resolve(address);
    }

    /**
     * Looks up an Address for a given participantId (next hop)
     *
     * @name MessageRouter#resolveNextHop
     * @function
     *
     * @param {String}
     *            participantId
     * @returns {Address} the address of the next hop in the direction of the given
     *          participantId, or undefined if not found
     */
    this.resolveNextHop = function resolveNextHop(participantId) {
        if (!isReady()) {
            log.debug("resolveNextHop: ignore call as message router is already shut down");
            return Promise.reject(new Error("message router is already shut down"));
        }

        const address = routingTable[participantId];

        if (address === undefined) {
            return resolveNextHopInternal(participantId);
        }

        return Promise.resolve(address);
    };

    function containsAddress(array, address) {
        //each address class provides an equals method, e.g. InProcessAddress
        let j;
        if (array === undefined) {
            return false;
        }
        for (j = 0; j < array.length; j++) {
            if (array[j].equals(address)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Get the address to which the passed in message should be sent to.
     * This is a multicast address calculated from the header content of the message.
     *
     * @param message the message for which we want to find an address to send it to.
     * @return the address to send the message to. Will not be null, because if an address can't be determined an exception is thrown.
     */
    function getAddressesForMulticast(joynrMessage) {
        const result = [];
        let address;
        if (!joynrMessage.isReceivedFromGlobal) {
            address = multicastAddressCalculator.calculate(joynrMessage);
            if (address !== undefined) {
                result.push(address);
            }
        }

        let multicastIdPattern, receivers;
        for (multicastIdPattern in multicastReceiversRegistry) {
            if (multicastReceiversRegistry.hasOwnProperty(multicastIdPattern)) {
                if (joynrMessage.to.match(new RegExp(multicastIdPattern)) !== null) {
                    receivers = multicastReceiversRegistry[multicastIdPattern];
                    if (receivers !== undefined) {
                        for (let i = 0; i < receivers.length; i++) {
                            address = routingTable[receivers[i]];
                            if (address !== undefined && !containsAddress(result, address)) {
                                result.push(address);
                            }
                        }
                    }
                }
            }
        }
        return result;
    }

    function routeInternalTransmitOnError(error) {
        //error while transmitting message
        log.debug(
            `Error while transmitting message: ${error}${
                error instanceof JoynrException ? ` ${error.detailMessage}` : ""
            }`
        );
        //TODO queue message and retry later
    }

    /**
     * Helper function to route a message once the address is known
     */
    function routeInternal(address, joynrMessage) {
        let errorMsg;
        // Error: The participant is not registered yet.
        // remote provider participants are registered by capabilitiesDirectory on lookup
        // local providers are registered by capabilitiesDirectory on register
        // replyCallers are registered when they are created

        if (!joynrMessage.isLocalMessage) {
            try {
                messageReplyToAddressCalculator.setReplyTo(joynrMessage);
            } catch (error) {
                messagesWithoutReplyTo.push(joynrMessage);
                errorMsg = `replyTo address could not be set: ${error}. Queuing message.`;
                log.warn(errorMsg, DiagnosticTags.forJoynrMessage(joynrMessage));
                return Promise.resolve();
            }
        }

        messagingStub = settings.messagingStubFactory.createMessagingStub(address);
        if (messagingStub === undefined) {
            errorMsg = `No message receiver found for participantId: ${joynrMessage.to} queuing message.`;
            log.info(errorMsg, DiagnosticTags.forJoynrMessage(joynrMessage));
            // TODO queue message and retry later
            return Promise.resolve();
        }
        return messagingStub.transmit(joynrMessage).catch(routeInternalTransmitOnError);
    }

    function registerGlobalRoutingEntryIfRequired(joynrMessage) {
        if (!joynrMessage.isReceivedFromGlobal) {
            return;
        }

        const type = joynrMessage.type;
        if (
            type === JoynrMessage.JOYNRMESSAGE_TYPE_REQUEST ||
            type === JoynrMessage.JOYNRMESSAGE_TYPE_SUBSCRIPTION_REQUEST ||
            type === JoynrMessage.JOYNRMESSAGE_TYPE_BROADCAST_SUBSCRIPTION_REQUEST ||
            type === JoynrMessage.JOYNRMESSAGE_TYPE_MULTICAST_SUBSCRIPTION_REQUEST
        ) {
            try {
                const replyToAddress = joynrMessage.replyChannelId;
                if (!UtilInternal.checkNullUndefined(replyToAddress)) {
                    // because the message is received via global transport, isGloballyVisible must be true
                    const isGloballyVisible = true;
                    that.addNextHop(
                        joynrMessage.from,
                        Typing.augmentTypes(JSON.parse(replyToAddress)),
                        isGloballyVisible
                    );
                }
            } catch (e) {
                log.error(`could not register global Routing Entry: ${e}`);
            }
        }
    }

    function forwardToRouteInternal(address) {
        return routeInternal(address, this);
    }

    function resolveNextHopOnError(e) {
        log.error(e.message);
    }

    function resolveNextHopAndRoute(participantId, joynrMessage) {
        const address = getAddressFromPersistency(participantId);

        function resolveNextHopOnSuccess(opArgs) {
            if (opArgs.resolved && parentMessageRouterAddress !== undefined) {
                routingTable[participantId] = parentMessageRouterAddress;
                return routeInternal(parentMessageRouterAddress, joynrMessage);
            }
            throw new Error(
                `nextHop cannot be resolved, as participant with id ${participantId} is not reachable by parent routing table`
            );
        }

        if (address === undefined) {
            if (routingProxy !== undefined) {
                return routingProxy
                    .resolveNextHop({
                        participantId
                    })
                    .then(resolveNextHopOnSuccess)
                    .catch(resolveNextHopOnError);
            }
            if (
                joynrMessage.type === JoynrMessage.JOYNRMESSAGE_TYPE_REPLY ||
                joynrMessage.type === JoynrMessage.JOYNRMESSAGE_TYPE_SUBSCRIPTION_REPLY ||
                joynrMessage.type === JoynrMessage.JOYNRMESSAGE_TYPE_PUBLICATION
            ) {
                const errorMsg = `Received message for unknown proxy. Dropping the message. ID: ${joynrMessage.msgId}`;
                const now = Date.now();
                log.warn(`${errorMsg}, expiryDate: ${joynrMessage.expiryDate}, now: ${now}`);
                return Promise.resolve();
            }

            log.warn(
                `No message receiver found for participantId: ${joynrMessage.to}. Queuing message.`,
                DiagnosticTags.forJoynrMessage(joynrMessage)
            );

            // message is queued until the participant is registered
            // TODO remove expired messages from queue
            settings.messageQueue.putMessage(joynrMessage);
            return Promise.resolve();
        }
        return routeInternal(address, joynrMessage);
    }

    /**
     * @name MessageRouter#route
     * @function
     *
     * @param {JoynrMessage}
     *            joynrMessage
     * @returns {Object} A+ promise object
     */
    this.route = function route(joynrMessage) {
        try {
            const now = Date.now();
            if (now > joynrMessage.expiryDate) {
                const errorMsg = `Received expired message. Dropping the message. ID: ${joynrMessage.msgId}`;
                log.warn(`${errorMsg}, expiryDate: ${joynrMessage.expiryDate}, now: ${now}`);
                return Promise.resolve();
            }
            log.debug(`Route message. ID: ${joynrMessage.msgId}, expiryDate: ${joynrMessage.expiryDate}, now: ${now}`);

            registerGlobalRoutingEntryIfRequired(joynrMessage);

            if (joynrMessage.type === JoynrMessage.JOYNRMESSAGE_TYPE_MULTICAST) {
                return Promise.all(getAddressesForMulticast(joynrMessage).map(forwardToRouteInternal, joynrMessage));
            }

            const participantId = joynrMessage.to;
            const address = routingTable[participantId];
            if (address !== undefined) {
                return routeInternal(address, joynrMessage);
            }

            return resolveNextHopAndRoute(participantId, joynrMessage);
        } catch (e) {
            log.error(`MessageRouter.route failed: ${e.message}`);
        }
    };

    /**
     * Registers the next hop with this specific participant Id
     *
     * @name RoutingTable#addNextHop
     * @function
     *
     * @param {String}
     *            participantId
     * @param {Address}
     *            address the address to register
     * @param {boolean}
     *            isGloballyVisible
     * @returns {Object} A+ promise object
     */
    this.addNextHop = function addNextHop(participantId, address, isGloballyVisible) {
        if (!isReady()) {
            log.debug("addNextHop: ignore call as message router is already shut down");
            return Promise.reject(new Error("message router is already shut down"));
        }
        // store the address of the participantId persistently
        routingTable[participantId] = address;
        const serializedAddress = JSONSerializer.stringify(address);
        let promise;
        if (serializedAddress === undefined || serializedAddress === null || serializedAddress === "{}") {
            log.info(
                `addNextHop: HOP address ${serializedAddress} will not be persisted for participant id: ${participantId}`
            );
        } else if (address._typeName !== InProcessAddress._typeName && persistency) {
            // only persist if it's not an InProcessAddress
            persistency.setItem(that.getStorageKey(participantId), serializedAddress);
        }

        if (routingProxy !== undefined) {
            // register remotely
            promise = that.addNextHopToParentRoutingTable(participantId, isGloballyVisible);
        } else {
            promise = Promise.resolve();
        }
        that.participantRegistered(participantId);
        return promise;
    };

    /**
     * Adds a new receiver for the identified multicasts.
     *
     * @name RoutingTable#addMulticastReceiver
     * @function
     *
     * @param {Object}
     *            parameters - object containing parameters
     * @param {String}
     *            parameters.multicastId
     * @param {String}
     *            parameters.subscriberParticipantId
     * @param {String}
     *            parameters.providerParticipantId
     * @returns {Object} A+ promise object
     */
    this.addMulticastReceiver = function addMulticastReceiver(parameters) {
        //1. handle call in local router
        //1.a store receiver in multicastReceiverRegistry
        const multicastIdPattern = multicastWildcardRegexFactory.createIdPattern(parameters.multicastId);
        const providerAddress = routingTable[parameters.providerParticipantId];

        if (multicastReceiversRegistry[multicastIdPattern] === undefined) {
            multicastReceiversRegistry[multicastIdPattern] = [];

            //1.b the first receiver for this multicastId -> inform MessagingSkeleton about receiver
            const skeleton = messagingSkeletonFactory.getSkeleton(providerAddress);
            if (skeleton !== undefined && skeleton.registerMulticastSubscription !== undefined) {
                skeleton.registerMulticastSubscription(parameters.multicastId);
            }
        }

        multicastReceiversRegistry[multicastIdPattern].push(parameters.subscriberParticipantId);

        //2. forward call to parent router (if available)
        if (
            parentMessageRouterAddress === undefined ||
            providerAddress === undefined ||
            providerAddress instanceof InProcessAddress
        ) {
            return Promise.resolve();
        }
        if (routingProxy !== undefined) {
            return routingProxy.addMulticastReceiver(parameters);
        }

        const deferred = UtilInternal.createDeferred();
        queuedAddMulticastReceiverCalls.push({
            parameters,
            resolve: deferred.resolve,
            reject: deferred.reject
        });

        return deferred.promise;
    };

    /**
     * Removes a receiver for the identified multicasts.
     *
     * @name RoutingTable#removeMulticastReceiver
     * @function
     *
     * @param {Object}
     *            parameters - object containing parameters
     * @param {String}
     *            parameters.multicastId
     * @param {String}
     *            parameters.subscriberParticipantId
     * @param {String}
     *            parameters.providerParticipantId
     * @returns {Object} A+ promise object
     */
    this.removeMulticastReceiver = function removeMulticastReceiver(parameters) {
        //1. handle call in local router
        //1.a remove receiver from multicastReceiverRegistry
        const multicastIdPattern = multicastWildcardRegexFactory.createIdPattern(parameters.multicastId);
        const providerAddress = routingTable[parameters.providerParticipantId];
        if (multicastReceiversRegistry[multicastIdPattern] !== undefined) {
            const receivers = multicastReceiversRegistry[multicastIdPattern];
            for (let i = 0; i < receivers.length; i++) {
                if (receivers[i] === parameters.subscriberParticipantId) {
                    receivers.splice(i, 1);
                    break;
                }
            }
            if (receivers.length === 0) {
                delete multicastReceiversRegistry[multicastIdPattern];

                //1.b no receiver anymore for this multicastId -> inform MessagingSkeleton about removed receiver
                const skeleton = messagingSkeletonFactory.getSkeleton(providerAddress);
                if (skeleton !== undefined && skeleton.unregisterMulticastSubscription !== undefined) {
                    skeleton.unregisterMulticastSubscription(parameters.multicastId);
                }
            }
        }

        //2. forward call to parent router (if available)
        if (
            parentMessageRouterAddress === undefined ||
            providerAddress === undefined ||
            providerAddress instanceof InProcessAddress
        ) {
            return Promise.resolve();
        }
        if (routingProxy !== undefined) {
            return routingProxy.removeMulticastReceiver(parameters);
        }

        const deferred = UtilInternal.createDeferred();
        queuedRemoveMulticastReceiverCalls.push({
            parameters,
            resolve: deferred.resolve,
            reject: deferred.reject
        });

        return deferred.promise;
    };

    /**
     * @function MessageRouter#participantRegistered
     *
     * @param {String} participantId
     *
     * @returns void
     */
    this.participantRegistered = function participantRegistered(participantId) {
        const messageQueue = settings.messageQueue.getAndRemoveMessages(participantId);

        if (messageQueue !== undefined) {
            let i = messageQueue.length;
            while (i--) {
                that.route(messageQueue[i]);
            }
        }
    };

    /**
     * Tell the message router that the given participantId is known. The message router
     * checks internally if an address is already present in the routing table. If not,
     * it adds the parentMessageRouterAddress to the routing table for this participantId.
     * @function MessageRouter#setToKnown
     *
     * @param {String} participantId
     *
     * @returns void
     */
    this.setToKnown = function setToKnown(participantId) {
        if (!isReady()) {
            log.debug("setToKnown: ignore call as message router is already shut down");
            return;
        }

        //if not already set
        if (routingTable[participantId] === undefined) {
            if (parentMessageRouterAddress !== undefined) {
                routingTable[participantId] = parentMessageRouterAddress;
            }
        }
    };

    this.hasMulticastReceivers = function() {
        return Object.keys(multicastReceiversRegistry).length > 0;
    };

    /**
     * Shutdown the message router
     *
     * @function
     * @name MessageRouter#shutdown
     */
    this.shutdown = function shutdown() {
        function rejectCall(call) {
            call.reject(new Error("Message Router has been shut down"));
        }

        if (queuedAddNextHopCalls !== undefined) {
            queuedAddNextHopCalls.forEach(rejectCall);
            queuedAddNextHopCalls = [];
        }
        if (queuedRemoveNextHopCalls !== undefined) {
            queuedRemoveNextHopCalls.forEach(rejectCall);
            queuedRemoveNextHopCalls = [];
        }
        if (queuedAddMulticastReceiverCalls !== undefined) {
            queuedAddMulticastReceiverCalls.forEach(rejectCall);
            queuedAddMulticastReceiverCalls = [];
        }
        if (queuedRemoveMulticastReceiverCalls !== undefined) {
            queuedRemoveMulticastReceiverCalls.forEach(rejectCall);
            queuedRemoveMulticastReceiverCalls = [];
        }
        started = false;
        settings.messageQueue.shutdown();
    };
}

module.exports = MessageRouter;
