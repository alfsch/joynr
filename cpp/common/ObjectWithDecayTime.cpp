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
#include "joynr/ObjectWithDecayTime.h"
#include <chrono>

namespace joynr
{

ObjectWithDecayTime::ObjectWithDecayTime(const JoynrTimePoint& decayTime) : decayTime(decayTime)
{
}

int64_t ObjectWithDecayTime::getRemainingTtl_ms() const
{
    int64_t decayTimeMillis = std::chrono::duration_cast<std::chrono::milliseconds>(
                                      decayTime.time_since_epoch()).count();
    int64_t now = std::chrono::duration_cast<std::chrono::milliseconds>(
                          std::chrono::system_clock::now().time_since_epoch()).count();
    return decayTimeMillis - now;
}
JoynrTimePoint ObjectWithDecayTime::getDecayTime() const
{
    return decayTime;
}

bool ObjectWithDecayTime::isExpired() const
{
    return std::chrono::system_clock::now() > decayTime;
}

} // namespace joynr
