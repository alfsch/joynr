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
require("../../../node-unit-test-helper");
const SubscriptionRequest = require("../../../../../main/js/joynr/dispatching/types/SubscriptionRequest");
const PeriodicSubscriptionQos = require("../../../../../main/js/joynr/proxy/PeriodicSubscriptionQos");

describe("libjoynr-js.joynr.dispatching.types.SubscriptionRequest", () => {
    const qosSettings = {
        periodMs: 50,
        expiryDateMs: 3,
        alertAfterIntervalMs: 80,
        publicationTtlMs: 100
    };

    it("is defined", () => {
        expect(SubscriptionRequest).toBeDefined();
    });

    it("is instantiable", () => {
        const subscriptionRequest = new SubscriptionRequest({
            subscribedToName: "attributeName",
            subscriptionId: "testSubscriptionId"
        });
        expect(subscriptionRequest).toBeDefined();
        expect(subscriptionRequest).not.toBeNull();
        expect(typeof subscriptionRequest === "object").toBeTruthy();
        expect(subscriptionRequest instanceof SubscriptionRequest).toBeTruthy();
    });

    it("handles missing parameters correctly", () => {
        // does not throw, with qos
        expect(() => {
            return new SubscriptionRequest({
                subscribedToName: "attributeName",
                subscriptionId: "testSubscriptionId",
                subscriptionQos: new PeriodicSubscriptionQos(qosSettings)
            });
        }).not.toThrow();

        // does not throw, without qos
        expect(() => {
            return new SubscriptionRequest({
                subscribedToName: "attributeName",
                subscriptionId: "testSubscriptionId"
            });
        }).not.toThrow();

        // throws on wrongly typed attributeName
        expect(() => {
            return new SubscriptionRequest({
                subscribedToName: {},
                subscriptionId: "testSubscriptionId"
            });
        }).toThrow();

        // throws on missing attributeName
        expect(() => {
            return new SubscriptionRequest({
                subscriptionId: "testSubscriptionId"
            });
        }).toThrow();

        // throws on missing subscriptionId
        expect(() => {
            return new SubscriptionRequest({
                subscribedToName: "attributeName",
                subscriptionQos: new PeriodicSubscriptionQos(qosSettings)
            });
        }).toThrow();

        // throws on missing settings object type
        expect(() => {
            return new SubscriptionRequest();
        }).toThrow();

        // throws on wrong settings object type
        expect(() => {
            return new SubscriptionRequest("wrong type");
        }).toThrow();

        // throws on incorrect qos
        // expect(function() {
        // var subReq = new SubscriptionRequest({
        // subscribedToName : "attributeName",
        // subscriptionId : "testSubscriptionId",
        // qos : {}
        // });
        // }).toThrow();
    });

    it("is constructs with correct member values", () => {
        const subscribedToName = "attributeName";
        const subscriptionQos = new PeriodicSubscriptionQos(qosSettings);
        const subscriptionId = "testSubscriptionId";

        const subscriptionRequest = new SubscriptionRequest({
            subscribedToName,
            subscriptionQos,
            subscriptionId
        });

        expect(subscriptionRequest.subscribedToName).toEqual(subscribedToName);
        expect(subscriptionRequest.subscriptionQos).toEqual(subscriptionQos);
        expect(subscriptionRequest.subscriptionId).toEqual(subscriptionId);
    });
});
