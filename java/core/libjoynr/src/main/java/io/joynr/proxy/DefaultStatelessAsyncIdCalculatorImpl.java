/*-
 * #%L
 * %%
 * Copyright (C) 2011 - 2018 BMW Car IT GmbH
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
package io.joynr.proxy;

import io.joynr.dispatcher.rpc.annotation.StatelessCallbackCorrelation;
import io.joynr.exceptions.JoynrIllegalStateException;
import io.joynr.exceptions.JoynrRuntimeException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.google.inject.Inject;
import com.google.inject.Singleton;
import com.google.inject.name.Named;

import io.joynr.messaging.MessagingPropertyKeys;

import java.io.UnsupportedEncodingException;
import java.lang.reflect.Method;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Singleton
public class DefaultStatelessAsyncIdCalculatorImpl implements StatelessAsyncIdCalculator {

    private static final Logger logger = LoggerFactory.getLogger(DefaultStatelessAsyncIdCalculatorImpl.class);

    private final String channelId;
    private final Random random = new Random();
    private final Map<String, String> participantIdMap = new ConcurrentHashMap<>();

    @Inject
    public DefaultStatelessAsyncIdCalculatorImpl(@Named(MessagingPropertyKeys.CHANNELID) String channelId) {
        this.channelId = channelId;
    }

    @Override
    public String calculateParticipantId(String interfaceName, StatelessAsyncCallback statelessAsyncCallback) {
        String statelessCallbackId = calculateStatelessCallbackId(interfaceName, statelessAsyncCallback);
        String fullParticipantId = channelId + CHANNEL_SEPARATOR + statelessCallbackId;
        try {
            String uuid = UUID.nameUUIDFromBytes(fullParticipantId.getBytes("UTF-8")).toString();
            participantIdMap.putIfAbsent(uuid, statelessCallbackId);
            return uuid;
        } catch (UnsupportedEncodingException e) {
            throw new JoynrRuntimeException("Platform does not support UTF-8", e);
        }
    }

    @Override
    public String calculateStatelessCallbackId(String interfaceName, StatelessAsyncCallback statelessAsyncCallback) {
        return interfaceName + USE_CASE_SEPARATOR + statelessAsyncCallback.getUseCase();
    }

    @Override
    public String calculateStatelessCallbackMethodId(Method method) {
        StatelessCallbackCorrelation callbackCorrelation = method.getAnnotation(StatelessCallbackCorrelation.class);
        if (callbackCorrelation == null) {
            logger.error("Method {} on {} is missing StatelessCallbackCorrelation. Unable to generate callback method ID.",
                         method,
                         method.getDeclaringClass().getName());
            throw new JoynrRuntimeException("No StatelessCallbackCorrelation found on method " + method);
        }
        return callbackCorrelation.value();
    }

    @Override
    public String calculateStatelessCallbackRequestReplyId(Method method) {
        String requestReplyId = String.valueOf(random.nextLong());
        String methodId = calculateStatelessCallbackMethodId(method);
        return requestReplyId + REQUEST_REPLY_ID_SEPARATOR + methodId;
    }

    @Override
    public String extractMethodIdFromRequestReplyId(String requestReplyId) {
        if (requestReplyId == null || requestReplyId.trim().isEmpty()
                || !requestReplyId.contains(REQUEST_REPLY_ID_SEPARATOR)) {
            throw new JoynrIllegalStateException("Unable to extract method ID from invalid request/reply ID: "
                    + requestReplyId);
        }
        int index = requestReplyId.indexOf(REQUEST_REPLY_ID_SEPARATOR);
        return requestReplyId.substring(index + REQUEST_REPLY_ID_SEPARATOR.length());
    }

    @Override
    public String fromParticipantUuid(String statelessParticipantIdUuid) {
        String statelessCallbackId = Optional.ofNullable(participantIdMap.get(statelessParticipantIdUuid))
                                             .orElseThrow(() -> new JoynrIllegalStateException("Unknown stateless participant ID UUID: "
                                                     + statelessParticipantIdUuid));
        return statelessCallbackId;
    }

}
