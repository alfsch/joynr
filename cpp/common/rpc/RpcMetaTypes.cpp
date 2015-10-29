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
#include "common/rpc/RpcMetaTypes.h"
#include "joynr/Request.h"
#include "joynr/Reply.h"

namespace joynr
{

void registerRpcMetaTypes()
{
    qRegisterMetaType<Request>("Request");
    qRegisterMetaType<Reply>("Reply");
    qRegisterMetaType<std::shared_ptr<Reply>>("std::shared_ptrJsonReply");
}

} // namespace joynr
