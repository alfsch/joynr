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
#ifndef JOYNRUNTIME_H
#define JOYNRUNTIME_H

#include "joynr/JoynrRuntimeImpl.h"

namespace joynr
{

/**
 * @brief Class representing the central Joynr Api object,
 * used to register / unregister providers and create proxy builders
 */
class JOYNRCLUSTERCONTROLLERRUNTIME_EXPORT JoynrRuntime
{
public:
    /**
     * @brief Destroys a JoynrRuntime instance
     */
    ~JoynrRuntime()
    {
        shutdown();
    }
    void shutdown()
    {
        runtimeImpl->shutdown();
    }

    /**
     * @brief Registers a provider with the joynr communication framework asynchronously.
     * @tparam TIntfProvider The interface class of the provider to register. The corresponding
     * template parameter of a Franca interface called "MyDemoIntf" is "MyDemoIntfProvider".
     * @param domain The domain to register the provider on. Has to be
     * identical at the client to be able to find the provider.
     * @param provider The provider instance to register.
     * @param providerQos The qos associated with the registered provider.
     * @param onSucess: Will be invoked when provider registration succeeded.
     * @param onError: Will be invoked when the provider could not be registered. An exception,
     * which describes the error, is passed as the parameter.
     * @return The globally unique participant ID of the provider. It is assigned by the joynr
     * communication framework.
     */
    template <class TIntfProvider>
    std::string registerProviderAsync(
            const std::string& domain,
            std::shared_ptr<TIntfProvider> provider,
            const joynr::types::ProviderQos& providerQos,
            std::function<void()> onSuccess,
            std::function<void(const exceptions::JoynrRuntimeException&)> onError) noexcept
    {
        return runtimeImpl->registerProviderAsync(
                domain, provider, providerQos, std::move(onSuccess), std::move(onError));
    }

    /**
     * @brief Registers a provider with the joynr communication framework.
     * @tparam TIntfProvider The interface class of the provider to register. The corresponding
     * template parameter of a Franca interface called "MyDemoIntf" is "MyDemoIntfProvider".
     * @param domain The domain to register the provider on. Has to be
     * identical at the client to be able to find the provider.
     * @param provider The provider instance to register.
     * @param providerQos The qos associated with the registered provider.
     * @return The globally unique participant ID of the provider. It is assigned by the joynr
     * communication framework.
     */
    template <class TIntfProvider>
    std::string registerProvider(const std::string& domain,
                                 std::shared_ptr<TIntfProvider> provider,
                                 const joynr::types::ProviderQos& providerQos)
    {
        Future<void> future;
        auto onSuccess = [&future]() { future.onSuccess(); };
        auto onError = [&future](const exceptions::JoynrRuntimeException& exception) {
            future.onError(std::make_shared<exceptions::JoynrRuntimeException>(exception));
        };

        std::string participiantId = registerProviderAsync(
                domain, provider, providerQos, std::move(onSuccess), std::move(onError));
        future.get();
        return participiantId;
    }

    /**
     * @brief Unregisters the provider from the joynr communication framework.
     *
     * Unregister a provider identified by its globally unique participant ID. The participant ID is
     * returned during the provider registration process.
     * @param participantId The participantId of the provider which shall be unregistered
     * @param onSucess: Will be invoked when provider unregistration succeeded.
     * @param onError: Will be invoked when the provider could not be unregistered. An exception,
     * which describes the error, is passed as the parameter.
     */
    void unregisterProviderAsync(
            const std::string& participantId,
            std::function<void()> onSuccess,
            std::function<void(const exceptions::JoynrRuntimeException&)> onError) noexcept
    {
        return runtimeImpl->unregisterProviderAsync(
                participantId, std::move(onSuccess), std::move(onError));
    }

    /**
     * @brief Unregisters the provider from the joynr framework
     * @tparam TIntfProvider The interface class of the provider to unregister. The corresponding
     * template parameter of a Franca interface called "MyDemoIntf" is "MyDemoIntfProvider".
     * @param domain The domain to unregister the provider from. It must match the domain used
     * during provider registration.
     * @param provider The provider instance to unregister the provider from.
     * @param onSucess: Will be invoked when provider unregistration succeeded.
     * @param onError: Will be invoked when the provider could not be unregistered. An exception,
     * which describes the error, is passed as the parameter.
     * @return The globally unique participant ID of the provider. It is assigned by the joynr
     * communication framework.
     */
    template <class TIntfProvider>
    std::string unregisterProviderAsync(
            const std::string& domain,
            std::shared_ptr<TIntfProvider> provider,
            std::function<void()> onSuccess,
            std::function<void(const exceptions::JoynrRuntimeException&)> onError) noexcept
    {
        return runtimeImpl->unregisterProviderAsync(
                domain, provider, std::move(onSuccess), std::move(onError));
    }

    /**
     * @brief Unregisters the provider from the joynr communication framework.
     *
     * Unregister a provider identified by its globally unique participant ID. The participant ID is
     * returned during the provider registration process.
     * @param participantId The participantId of the provider which shall be unregistered
     */
    void unregisterProvider(const std::string& participantId)
    {
        Future<void> future;
        auto onSuccess = [&future]() { future.onSuccess(); };
        auto onError = [&future](const exceptions::JoynrRuntimeException& exception) {
            future.onError(std::make_shared<exceptions::JoynrRuntimeException>(exception));
        };

        unregisterProviderAsync(participantId, std::move(onSuccess), std::move(onError));
        future.get();
    }

    /**
     * @brief Unregisters the provider from the joynr framework
     * @tparam TIntfProvider The interface class of the provider to unregister. The corresponding
     * template parameter of a Franca interface called "MyDemoIntf" is "MyDemoIntfProvider".
     * @param domain The domain to unregister the provider from. It must match the domain used
     * during provider registration.
     * @param provider The provider instance to unregister the provider from.
     * @return The globally unique participant ID of the provider. It is assigned by the joynr
     * communication framework.
     */
    template <class TIntfProvider>
    std::string unregisterProvider(const std::string& domain,
                                   std::shared_ptr<TIntfProvider> provider)
    {
        assert(!domain.empty());
        Future<void> future;
        auto onSuccess = [&future]() { future.onSuccess(); };
        auto onError = [&future](const exceptions::JoynrRuntimeException& exception) {
            future.onError(std::make_shared<exceptions::JoynrRuntimeException>(exception));
        };
        std::string participantId =
                unregisterProviderAsync(domain, provider, std::move(onSuccess), std::move(onError));
        future.get();
        return participantId;
    }

    /**
     * @brief Creates a new proxy builder for the given domain and interface.
     *
     * The proxy builder is used to create a proxy object for a remote provider. It is already
     * bound to a domain and communication interface as defined in Franca. After configuration is
     * finished, ProxyBuilder::build() is called to create the proxy object.
     *
     * @tparam TIntfProxy The interface class of the proxy to create. The corresponding template
     * parameter of a Franca interface called "MyDemoIntf" is "MyDemoIntfProxy".
     * @param domain The domain to connect this proxy to.
     * @return Pointer to the proxybuilder<T> instance
     * @return A proxy builder object that can be used to create proxies.
     */
    template <class TIntfProxy>
    std::shared_ptr<ProxyBuilder<TIntfProxy>> createProxyBuilder(const std::string& domain)
    {
        return runtimeImpl->createProxyBuilder<TIntfProxy>(domain);
    }

    /**
     * @brief Create a JoynrRuntime object. The call blocks until the runtime is created.
     * @param pathToLibjoynrSettings
     * @param pathToMessagingSettings
     * @param An optional key chain that is used for websocket connections
     * @return pointer to a JoynrRuntime instance
     */
    static std::shared_ptr<JoynrRuntime> createRuntime(
            const std::string& pathToLibjoynrSettings,
            const std::string& pathToMessagingSettings = "",
            std::shared_ptr<IKeychain> keyChain = nullptr);

    /**
     * @brief Create a JoynrRuntime object. The call blocks until the runtime is created.
     * @param settings settings object
     * @param An optional key chain that is used for websocket connections
     * @return pointer to a JoynrRuntime instance
     */
    static std::shared_ptr<JoynrRuntime> createRuntime(
            std::unique_ptr<Settings> settings,
            std::shared_ptr<IKeychain> keyChain = nullptr);

    /**
     * @brief Create a JoynrRuntime object asynchronously. The call does not block. A callback
     * will be called when the runtime creation finished.
     * @param pathToLibjoynrSettings Path to lib joynr setting files
     * @param onSuccess Is called when the runtime is available for use
     * @param onError Is called when an error occurs
     * @param pathToMessagingSettings
     * @param An optional key chain that is used for websocket connections
     * @return shared_ptr to the JoynrRuntime instance; this instance MUST NOT be used before
     * onSuccess is called
     */
    static std::shared_ptr<JoynrRuntime> createRuntimeAsync(
            const std::string& pathToLibjoynrSettings,
            std::function<void()> onSuccess,
            std::function<void(const exceptions::JoynrRuntimeException& exception)> onError,
            const std::string& pathToMessagingSettings = "",
            std::shared_ptr<IKeychain> keyChain = nullptr) noexcept;

    /**
     * @brief Create a JoynrRuntime object asynchronously. The call does not block. A callback
     * will be called when the runtime creation finished.
     * @param settings settings object
     * @param onSuccess Is called when the runtime is available for use
     * @param onError Is called when an error occurs
     * @param An optional key chain that is used for websocket connections
     * @return shared_ptr to the JoynrRuntime instance; this instance MUST NOT be used before
     * onSuccess is called
     */
    static std::shared_ptr<JoynrRuntime> createRuntimeAsync(
            std::unique_ptr<Settings> settings,
            std::function<void()> onSuccess,
            std::function<void(const exceptions::JoynrRuntimeException& exception)> onError,
            std::shared_ptr<IKeychain> keyChain = nullptr) noexcept;

    /**
     * @brief Constructs a JoynrRuntime instance
     * @param settings The system service settings
     */
    explicit JoynrRuntime(std::shared_ptr<JoynrRuntimeImpl> runtimeImpl)
            : runtimeImpl(std::move(runtimeImpl))
    {
    }

protected:
private:
    std::shared_ptr<JoynrRuntimeImpl> runtimeImpl;
    DISALLOW_COPY_AND_ASSIGN(JoynrRuntime);
};

} // namespace joynr
#endif // JOYNRUNTIME_H
