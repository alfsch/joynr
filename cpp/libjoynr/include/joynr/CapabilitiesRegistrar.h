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
#ifndef CAPABILITIESREGISTRAR_H
#define CAPABILITIESREGISTRAR_H

#include <cassert>
#include <chrono>
#include <memory>
#include <string>
#include <vector>

#include "joynr/Future.h"
#include "joynr/IDispatcher.h"
#include "joynr/IMessageRouter.h"
#include "joynr/JoynrExport.h"
#include "joynr/Logger.h"
#include "joynr/MulticastBroadcastListener.h"
#include "joynr/ParticipantIdStorage.h"
#include "joynr/PrivateCopyAssign.h"
#include "joynr/RequestCallerFactory.h"
#include "joynr/Util.h"
#include "joynr/Settings.h"
#include "joynr/system/IDiscovery.h"
#include "joynr/system/RoutingTypes/Address.h"
#include "joynr/types/DiscoveryEntry.h"
#include "joynr/types/Version.h"

namespace joynr
{

/**
 * Class that handles provider registration/deregistration
 */
class JOYNR_EXPORT CapabilitiesRegistrar
{
public:
    CapabilitiesRegistrar(
            std::vector<std::shared_ptr<IDispatcher>> dispatcherList,
            std::shared_ptr<joynr::system::IDiscoveryAsync> discoveryProxy,
            std::shared_ptr<ParticipantIdStorage> participantIdStorage,
            std::shared_ptr<const joynr::system::RoutingTypes::Address> dispatcherAddress,
            std::shared_ptr<IMessageRouter> messageRouter,
            std::int64_t defaultExpiryIntervalMs,
            std::weak_ptr<PublicationManager> publicationManager,
            const std::string& globalAddress);

    template <class T>
    std::string addAsync(
            const std::string& domain,
            std::shared_ptr<T> provider,
            const types::ProviderQos& providerQos,
            std::function<void()> onSuccess,
            std::function<void(const joynr::exceptions::JoynrRuntimeException& error)> onError,
            bool persist = true,
            bool awaitGlobalRegistration = false) noexcept
    {
        const std::string interfaceName = T::INTERFACE_NAME();
        const std::string participantId = participantIdStorage->getProviderParticipantId(
                domain, interfaceName, T::MAJOR_VERSION);
        std::shared_ptr<RequestCaller> caller = RequestCallerFactory::create<T>(provider);
        provider->registerBroadcastListener(
                std::make_shared<MulticastBroadcastListener>(participantId, publicationManager));

        const std::int64_t now =
                std::chrono::duration_cast<std::chrono::milliseconds>(
                        std::chrono::system_clock::now().time_since_epoch()).count();
        const std::int64_t lastSeenDateMs = now;
        const std::int64_t defaultExpiryDateMs = now + defaultExpiryIntervalMs;
        const std::string defaultPublicKeyId("");
        joynr::types::Version providerVersion(T::MAJOR_VERSION, T::MINOR_VERSION);
        joynr::types::DiscoveryEntry entry(providerVersion,
                                           domain,
                                           interfaceName,
                                           participantId,
                                           providerQos,
                                           lastSeenDateMs,
                                           defaultExpiryDateMs,
                                           defaultPublicKeyId);
        bool isGloballyVisible = providerQos.getScope() == types::ProviderScope::GLOBAL;

        auto onSuccessWrapper = [
            domain,
            interfaceName,
            majorVersion = T::MAJOR_VERSION,
            dispatcherList = this->dispatcherList,
            caller,
            participantIdStorage = util::as_weak_ptr(participantIdStorage),
            messageRouter = util::as_weak_ptr(messageRouter),
            participantId,
            discoveryProxy = util::as_weak_ptr(discoveryProxy),
            entry = std::move(entry),
            awaitGlobalRegistration,
            onSuccess = std::move(onSuccess),
            onError,
            persist
        ]()
        {
            if (persist) {
                // Sync persistency to disk now that registration is done.
                if (auto participantIdStoragePtr = participantIdStorage.lock()) {
                    participantIdStoragePtr->setProviderParticipantId(
                            domain, interfaceName, majorVersion, participantId);
                }
            }

            auto onErrorWrapper = [
                participantId,
                messageRouter = std::move(messageRouter),
                onError = std::move(onError)
            ](const joynr::exceptions::JoynrRuntimeException& error)
            {
                if (auto ptr = messageRouter.lock()) {
                    ptr->removeNextHop(participantId);
                }
                onError(error);
            };

            if (auto discoveryProxyPtr = discoveryProxy.lock()) {

                discoveryProxyPtr->addAsync(entry,
                                            awaitGlobalRegistration,
                                            [domain, interfaceName, participantId, onSuccess]() {
                                                JOYNR_LOG_INFO(logger(),
                                                               "Registered Provider: "
                                                               "participantId: {}, domain: {}, "
                                                               "interfaceName: {}",
                                                               participantId,
                                                               domain,
                                                               interfaceName);
                                                onSuccess();
                                            },
                                            std::move(onErrorWrapper));
            } else {
                const joynr::exceptions::JoynrRuntimeException error(
                        "runtime and required discovery proxy have been already destroyed");
                onErrorWrapper(error);
            }
        };

        for (std::shared_ptr<IDispatcher> currentDispatcher : dispatcherList) {
            // TODO will the provider be registered at all dispatchers or
            //     should it be configurable which ones are used to contact it.
            assert(currentDispatcher != nullptr);
            currentDispatcher->addRequestCaller(participantId, caller);
        }

        constexpr std::int64_t expiryDateMs = std::numeric_limits<std::int64_t>::max();
        const bool isSticky = false;
        const bool allowUpdate = false;
        messageRouter->addNextHop(participantId,
                                  dispatcherAddress,
                                  isGloballyVisible,
                                  expiryDateMs,
                                  isSticky,
                                  allowUpdate,
                                  std::move(onSuccessWrapper),
                                  std::move(onError));

        return participantId;
    }

    void removeAsync(const std::string& participantId,
                     std::function<void()> onSuccess,
                     std::function<void(const joynr::exceptions::JoynrRuntimeException& error)>
                             onError) noexcept;

    template <class T>
    std::string removeAsync(
            const std::string& domain,
            std::shared_ptr<T> provider,
            std::function<void()> onSuccess,
            std::function<void(const joynr::exceptions::JoynrRuntimeException& error)>
                    onError) noexcept
    {
        std::string interfaceName = T::INTERFACE_NAME();
        // Get the provider participant Id - the persisted provider Id has priority
        std::string participantId = participantIdStorage->getProviderParticipantId(
                domain, interfaceName, T::MAJOR_VERSION);
        removeAsync(participantId,
                    [participantId, domain, interfaceName, onSuccess]() {
                        JOYNR_LOG_INFO(logger(),
                                       "Unregistered Provider: participantId: {}, domain: {}, "
                                       "interfaceName: {}",
                                       participantId,
                                       domain,
                                       interfaceName);

                        onSuccess();
                    },
                    std::move(onError));
        return participantId;
    }

    void addDispatcher(std::shared_ptr<IDispatcher> dispatcher);
    void removeDispatcher(std::shared_ptr<IDispatcher> dispatcher);

private:
    DISALLOW_COPY_AND_ASSIGN(CapabilitiesRegistrar);
    std::vector<std::shared_ptr<IDispatcher>> dispatcherList;
    std::shared_ptr<joynr::system::IDiscoveryAsync> discoveryProxy;
    std::shared_ptr<ParticipantIdStorage> participantIdStorage;
    std::shared_ptr<const joynr::system::RoutingTypes::Address> dispatcherAddress;
    std::shared_ptr<IMessageRouter> messageRouter;
    std::int64_t defaultExpiryIntervalMs;
    std::weak_ptr<PublicationManager> publicationManager;
    const std::string globalAddress;
    ADD_LOGGER(CapabilitiesRegistrar)
};

} // namespace joynr
#endif // CAPABILITIESREGISTRAR_H
