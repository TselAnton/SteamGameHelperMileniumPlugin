/**
 * Steam Game Review Writer Plugin - Frontend JavaScript
 * Adds review functionality to Steam game pages and context menus
 */

const MILLENNIUM_IS_CLIENT_MODULE = true;
const pluginName = "steam-game-review-writer";

function InitializePlugins() {
    // Plugin initialization similar to steam-collections-plus
    var _a, _b;
    (_a = (window.PLUGIN_LIST || (window.PLUGIN_LIST = {})))[pluginName] || (_a[pluginName] = {});
    (_b = (window.MILLENNIUM_PLUGIN_SETTINGS_STORE || (window.MILLENNIUM_PLUGIN_SETTINGS_STORE = {})))[pluginName] || (_b[pluginName] = {});
    
    let IPCType;
    (function (IPCType) {
        IPCType[IPCType["CallServerMethod"] = 0] = "CallServerMethod";
    })(IPCType || (IPCType = {}));
    
    let pluginStore = window.MILLENNIUM_PLUGIN_SETTINGS_STORE[pluginName];
    let IPCMessageId = `Millennium.Internal.IPC.[${pluginName}]`;
    
    const __call_server_method__ = (methodName, args) => Millennium.callServerMethod(pluginName, methodName, args);
    const __wrapped_callable__ = (methodName) => MILLENNIUM_API.callable(__call_server_method__, methodName);
    
    // Backend method wrappers
    const saveReview = __wrapped_callable__("Backend.save_review");
    const loadReview = __wrapped_callable__("Backend.load_review");
    const deleteReview = __wrapped_callable__("Backend.delete_review");
    const hasReview = __wrapped_callable__("Backend.has_review");
    const getConfig = __wrapped_callable__("Backend.get_config");
}

InitializePlugins();

const MAX_REVIEW_LENGTH = 5000;

/**
 * Main plugin entry point similar to steam-collections-plus
 */
let PluginEntryPointMain = function() {
    return function(context, api, react, reactDOM) {
        "use strict";
        
        const { Millennium, findElement, findModule, showContextMenu, showModal, sleep } = api;
        
        // Backend method wrappers
        const saveReview = api.callable(Millennium.callServerMethod, "Backend.save_review");
        const loadReview = api.callable(Millennium.callServerMethod, "Backend.load_review");
        const deleteReview = api.callable(Millennium.callServerMethod, "Backend.delete_review");
        const hasReview = api.callable(Millennium.callServerMethod, "Backend.has_review");
        const getConfig = api.callable(Millennium.callServerMethod, "Backend.get_config");
        
        // Helper function to find elements
        const findElementAsync = async (selector, document = document) => {
            return [...await findElement(document, selector)][0];
        };
        
        /**
         * Main plugin function - similar to steam-collections-plus structure
         */
        async function mainPluginFunction(context) {
            if (context.m_strName === "SP Desktop_uid0") {
                console.log(`[${pluginName}] Plugin started`);
                
                // Wait for MainWindowBrowserManager
                let browserManager = undefined;
                while (!browserManager) {
                    console.log(`[${pluginName}] Waiting for MainWindowBrowserManager`);
                    try {
                        browserManager = MainWindowBrowserManager;
                    } catch {
                        await sleep(100);
                    }
                }
                
                browserManager.m_browser.on("finished-request", async (request, window) => {
                    console.log(`[${pluginName}] Page loaded: ${browserManager.m_lastLocation.pathname}`);
                    
                    // Handle game app pages - similar to steam-collections-plus
                    if (browserManager.m_lastLocation.pathname.startsWith("/library/app/")) {
                        await handleGamePage(context);
                    }
                });
            }
        }
        
        /**
         * Handle game page - add review button exactly like steam-collections-plus
         */
        async function handleGamePage(context) {
            console.log(`[${pluginName}] Handling game page`);
            
            try {
                // Find the game buttons container - exact same pattern as steam-collections-plus
                const buttonsContainer = await findElementAsync(
                    `div.${findModule(e => e.InPage).InPage} div.${findModule(e => e.AppButtonsContainer).AppButtonsContainer} > div.${findModule(e => e.MenuButtonContainer).MenuButtonContainer}:not([role="button"])`,
                    context.m_popup.document
                );
                
                if (!buttonsContainer) {
                    console.log(`[${pluginName}] Buttons container not found`);
                    return;
                }
                
                // Check if review button already exists - same pattern as steam-collections-plus
                if (!buttonsContainer.parentNode.querySelector("div.review-writer-button")) {
                    console.log(`[${pluginName}] Creating review button`);
                    
                    // Create review button exactly like steam-collections-plus
                    const reviewButton = buttonsContainer.cloneNode(true);
                    reviewButton.classList.add("review-writer-button");
                    reviewButton.firstChild.innerHTML = "✍️ Review";
                    
                    // Add button to container exactly like steam-collections-plus
                    buttonsContainer.parentNode.insertBefore(reviewButton, buttonsContainer.nextSibling);
                    
                    // Add click event
                    reviewButton.addEventListener("click", async () => {
                        console.log(`[${pluginName}] Review button clicked`);
                        await openReviewModal(context);
                    });
                }
                
            } catch (error) {
                console.error(`[${pluginName}] Error handling game page:`, error);
            }
        }
        
        /**
         * Open review modal using Steam's modal system - exactly like steam-collections-plus
         */
        async function openReviewModal(context) {
            console.log(`[${pluginName}] Opening review modal`);
            
            try {
                // Get current game info like steam-collections-plus does
                const gameId = uiStore.currentGameListSelection?.nAppId?.toString();
                const gameName = appStore.allApps.find(app => app.appid === uiStore.currentGameListSelection?.nAppId)?.display_name || "Unknown Game";
                
                console.log(`[${pluginName}] Game info: ${gameName} (${gameId})`);
                
                // Check if review exists
                const reviewExists = await hasReview({ game_id: gameId });
                const existingReview = reviewExists ? await loadReview({ game_id: gameId }) : "";
                
                // Create modal using Steam's React system - exactly like steam-collections-plus
                showModal(
                    react.createElement(ReviewModalComponent, {
                        gameId: gameId,
                        gameName: gameName,
                        existingReview: existingReview,
                        onSave: async (reviewText) => {
                            const success = await saveReview({
                                game_id: gameId,
                                game_name: gameName,
                                review_text: reviewText
                            });
                            if (success) {
                                console.log(`[${pluginName}] Review saved successfully`);
                                return true;
                            } else {
                                console.error(`[${pluginName}] Failed to save review`);
                                return false;
                            }
                        },
                        onDelete: async () => {
                            const success = await deleteReview({ game_id: gameId });
                            if (success) {
                                console.log(`[${pluginName}] Review deleted successfully`);
                                return true;
                            } else {
                                console.error(`[${pluginName}] Failed to delete review`);
                                return false;
                            }
                        }
                    }),
                    context.m_popup.window,
                    {
                        strTitle: "Game Review Writer",
                        bHideMainWindowForPopouts: false,
                        bForcePopOut: true,
                        popupHeight: 600,
                        popupWidth: 700
                    }
                );
                
            } catch (error) {
                console.error(`[${pluginName}] Error opening review modal:`, error);
            }
        }
        
        /**
         * Review Modal Component using Steam's React
         */
        function ReviewModalComponent(props) {
            const { gameId, gameName, existingReview, onSave, onDelete } = props;
            const [reviewText, setReviewText] = react.useState(existingReview || "");
            const [isLoading, setIsLoading] = react.useState(false);
            const [message, setMessage] = react.useState("");
            
            const handleSave = async () => {
                if (reviewText.trim().length === 0) {
                    setMessage("Review cannot be empty");
                    return;
                }
                
                if (reviewText.length > MAX_REVIEW_LENGTH) {
                    setMessage(`Review is too long (maximum ${MAX_REVIEW_LENGTH} characters)`);
                    return;
                }
                
                setIsLoading(true);
                setMessage("");
                
                try {
                    const success = await onSave(reviewText);
                    if (success) {
                        setMessage("Review saved successfully!");
                        setTimeout(() => {
                            // Close modal
                            if (window.close) window.close();
                        }, 1500);
                    } else {
                        setMessage("Failed to save review");
                    }
                } catch (error) {
                    console.error(`[${pluginName}] Error saving review:`, error);
                    setMessage("Error saving review");
                } finally {
                    setIsLoading(false);
                }
            };
            
            const handleDelete = async () => {
                if (!confirm("Are you sure you want to delete this review?")) {
                    return;
                }
                
                setIsLoading(true);
                setMessage("");
                
                try {
                    const success = await onDelete();
                    if (success) {
                        setMessage("Review deleted successfully!");
                        setReviewText("");
                        setTimeout(() => {
                            if (window.close) window.close();
                        }, 1500);
                    } else {
                        setMessage("Failed to delete review");
                    }
                } catch (error) {
                    console.error(`[${pluginName}] Error deleting review:`, error);
                    setMessage("Error deleting review");
                } finally {
                    setIsLoading(false);
                }
            };
            
            return react.createElement(react.Fragment, null,
                // Game info header
                react.createElement("div", { 
                    style: { 
                        marginBottom: "20px", 
                        padding: "15px", 
                        backgroundColor: "var(--color-base)", 
                        borderRadius: "8px",
                        borderLeft: "4px solid var(--color-accent)"
                    } 
                },
                    react.createElement("h3", { 
                        style: { margin: "0 0 5px 0", color: "var(--color-text)" } 
                    }, gameName),
                    react.createElement("p", { 
                        style: { margin: "0", color: "var(--color-text-secondary)", fontSize: "14px" } 
                    }, `Game ID: ${gameId}`)
                ),
                
                // Review textarea
                react.createElement("div", { style: { marginBottom: "15px" } },
                    react.createElement("label", { 
                        style: { 
                            display: "block", 
                            marginBottom: "8px", 
                            fontWeight: "bold",
                            color: "var(--color-text)"
                        } 
                    }, "Your Review:"),
                    react.createElement("textarea", {
                        value: reviewText,
                        onChange: (e) => setReviewText(e.target.value),
                        placeholder: "Share your thoughts about this game...",
                        style: {
                            width: "100%",
                            minHeight: "300px",
                            padding: "12px",
                            border: "1px solid var(--color-border)",
                            borderRadius: "4px",
                            backgroundColor: "var(--color-base)",
                            color: "var(--color-text)",
                            fontSize: "14px",
                            fontFamily: "inherit",
                            resize: "vertical",
                            outline: "none"
                        },
                        maxLength: MAX_REVIEW_LENGTH
                    }),
                    react.createElement("div", { 
                        style: { 
                            marginTop: "5px", 
                            textAlign: "right", 
                            fontSize: "12px",
                            color: reviewText.length > MAX_REVIEW_LENGTH * 0.9 ? "var(--color-error)" : 
                                   reviewText.length > MAX_REVIEW_LENGTH * 0.8 ? "var(--color-warning)" : "var(--color-text-secondary)"
                        } 
                    }, `${reviewText.length} / ${MAX_REVIEW_LENGTH} characters`)
                ),
                
                // Message display
                message && react.createElement("div", { 
                    style: { 
                        marginBottom: "15px", 
                        padding: "10px", 
                        borderRadius: "4px",
                        backgroundColor: message.includes("success") ? "var(--color-success-bg)" : 
                                        message.includes("Error") || message.includes("Failed") ? "var(--color-error-bg)" : 
                                        "var(--color-warning-bg)",
                        color: message.includes("success") ? "var(--color-success)" : 
                               message.includes("Error") || message.includes("Failed") ? "var(--color-error)" : 
                               "var(--color-warning)",
                        fontSize: "14px"
                    } 
                }, message),
                
                // Action buttons
                react.createElement("div", { 
                    style: { 
                        display: "flex", 
                        gap: "10px", 
                        justifyContent: "flex-end" 
                    } 
                },
                    existingReview && react.createElement(react.DialogButton, {
                        style: { backgroundColor: "var(--color-error)", color: "white" },
                        onClick: handleDelete,
                        disabled: isLoading
                    }, "Delete Review"),
                    
                    react.createElement(react.DialogButton, {
                        style: { backgroundColor: "var(--color-accent)", color: "white" },
                        onClick: handleSave,
                        disabled: isLoading || reviewText.trim().length === 0
                    }, isLoading ? "Saving..." : existingReview ? "Update Review" : "Save Review"),
                    
                    react.createElement(react.DialogButton, {
                        onClick: () => window.close && window.close()
                    }, "Cancel")
                )
            );
        }
        
        return context.default = async function() {
            console.log(`[${pluginName}] Frontend startup`);
            await App.WaitForServicesInitialized();
            
            const popup = g_PopupManager.GetExistingPopup("SP Desktop_uid0");
            if (popup) {
                mainPluginFunction(popup);
            }
            g_PopupManager.AddPopupCreatedCallback(mainPluginFunction);
        };
    };
};

function ExecutePluginModule() {
    let pluginStore = window.MILLENNIUM_PLUGIN_SETTINGS_STORE[pluginName];
    
    pluginStore.OnPluginConfigChange = function(name, oldValue, newValue) {
        if (name in pluginStore.settingsStore) {
            pluginStore.ignoreProxyFlag = true;
            pluginStore.settingsStore[name] = newValue;
            pluginStore.ignoreProxyFlag = false;
        }
    };
    
    MILLENNIUM_BACKEND_IPC.postMessage(0, {
        pluginName: pluginName,
        methodName: "__builtins__.__millennium_plugin_settings_parser__"
    }).then(async (response) => {
        let mainPlugin = PluginEntryPointMain();
        Object.assign(window.PLUGIN_LIST[pluginName], {
            ...mainPlugin,
            __millennium_internal_plugin_name_do_not_use_or_change__: pluginName
        });
        
        let result = await mainPlugin.default();
        console.log(`[${pluginName}] Plugin module executed`);
    });
}

ExecutePluginModule();
