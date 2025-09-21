export interface SteamPopup {
	/**
	 * Root element.
	 */
	m_element: HTMLElement;
	m_popup: Window;
	/**
	 * Popup (internal) name.
	 */
	m_strName: string;
}

export interface MainWindowBrowserManager {
	ShowURL(url: string): void;

	/** BrowserViewPopup */
	m_browser: {
		on(event: "finished-request", callback: (currentURL: string, previousURL: string) => void): void;
		on(event: "start-request", callback: (url: string) => void): void;
	};

	/** Current location. */
	m_lastLocation: {
		pathname: string;
	};
}

export interface PopupManager {
	/**
	 * Adds a callback to dispatch on popup creation.
	 */
	AddPopupCreatedCallback(callback: (popup: SteamPopup) => void): void;

	/**
	 * @returns the popup for the specified popup name.
	 */
	GetExistingPopup(popupName: string): SteamPopup | undefined;
}

export interface App {
	WaitForServicesInitialized(): Promise<void>;
}
