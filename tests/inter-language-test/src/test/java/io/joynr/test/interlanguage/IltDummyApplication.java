package io.joynr.test.interlanguage;

/*
 * #%L
 * %%
 * Copyright (C) 2011 - 2013 BMW Car IT GmbH
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

import io.joynr.runtime.AbstractJoynrApplication;
import io.joynr.runtime.AcceptsMessageReceiver;
import io.joynr.runtime.JoynrRuntime;
import io.joynr.runtime.MessageReceiverType;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.inject.Inject;

@AcceptsMessageReceiver(MessageReceiverType.ANY)
public class IltDummyApplication extends AbstractJoynrApplication {

    @Inject
    private ObjectMapper objectMapper;

    @Override
    public void shutdown() {
        runtime.shutdown(true);
    }

    @Override
    public void run() {

    }

    public ObjectMapper getObjectMapper() {
        return objectMapper;
    }

    public String getLocalDomain() {
        return localDomain;
    }

    public JoynrRuntime getRuntime() {
        return runtime;
    }
}