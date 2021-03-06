/*-
 * #%L
 * %%
 * Copyright (C) 2018 BMW Car IT GmbH
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
package io.joynr.examples.customheaders;

import java.util.Map;
import java.util.UUID;

import javax.ejb.Stateless;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import io.joynr.messaging.JoynrMessageProcessor;
import joynr.ImmutableMessage;
import joynr.MutableMessage;

@Stateless
public class ConsumerMessageProcessor implements JoynrMessageProcessor {

    private static final Logger LOG = LoggerFactory.getLogger(ConsumerMessageProcessor.class);

    @Override
    public MutableMessage processOutgoing(MutableMessage joynrMessage) {
        LOG.info("Processing outgoing message {}", joynrMessage);
        Map<String, String> customHeaders = joynrMessage.getCustomHeaders();

        if (customHeaders != null && customHeaders.containsKey(CustomHeaderUtils.APP_CUSTOM_HEADER_KEY)) {
            // For the purpose of the example: Add additional custom header in case there
            // is already a custom header in the message set by the application via MessagingQos
            String processorCustomHeaderValue = CustomHeaderUtils.PROCESSOR_CUSTOM_HEADER_VALUE_PREFIX
                    + UUID.randomUUID().toString();
            customHeaders.put(CustomHeaderUtils.PROCESSOR_CUSTOM_HEADER_KEY, processorCustomHeaderValue);
            LOG.info("Set {} to {}", CustomHeaderUtils.PROCESSOR_CUSTOM_HEADER_KEY, processorCustomHeaderValue);
        }
        return joynrMessage;
    }

    @Override
    public ImmutableMessage processIncoming(ImmutableMessage joynrMessage) {
        LOG.info("Processing incoming message {}", joynrMessage);
        LOG.info("Custom headers are: {}", joynrMessage.getCustomHeaders());
        LOG.info("Message context is: {}", joynrMessage.getContext());
        return joynrMessage;
    }
}
