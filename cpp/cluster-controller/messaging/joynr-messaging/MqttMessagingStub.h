/*
 * #%L
 * %%
 * Copyright (C) 2011 - 2016 BMW Car IT GmbH
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
#ifndef MQTTMESSAGINGSTUB_H
#define MQTTMESSAGINGSTUB_H
#include <string>
#include <memory>

#include "joynr/IMessaging.h"
#include "joynr/PrivateCopyAssign.h"

namespace joynr
{

class IMessageSender;
class JoynrMessage;
/**
  * Is used by the ClusterController to contact another (remote) ClusterController
  */
class MqttMessagingStub : public IMessaging
{
public:
    explicit MqttMessagingStub(std::shared_ptr<IMessageSender> messageSender,
                               const std::string& destinationChannelId,
                               const std::string& receiveChannelId);
    ~MqttMessagingStub() override = default;
    void transmit(JoynrMessage& message) override;

private:
    DISALLOW_COPY_AND_ASSIGN(MqttMessagingStub);
    std::shared_ptr<IMessageSender> messageSender;
    const std::string destinationChannelId;
    const std::string receiveChannelId;
};

} // namespace joynr
#endif // MQTTMESSAGINGSTUB_H
