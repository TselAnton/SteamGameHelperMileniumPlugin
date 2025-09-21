import { callable, findModule, sleep, Millennium, Menu, MenuItem, showContextMenu, DialogButton, TextField, ModalRoot, showModal } from "@steambrew/client";
import { render } from "react-dom";
import React, { useState, useEffect } from "react";
import type * as globals from "./sharedjscontextglobals";

declare const g_PopupManager: globals.PopupManager;
declare const MainWindowBrowserManager: globals.MainWindowBrowserManager;
declare const App: globals.App;

// Backend функции для работы с обзорами
const get_review = callable<[{ app_id: number }], string>('Backend.get_review');
const save_review = callable<[{ app_id: number, review_data: string }], boolean>('Backend.save_review');
const delete_review = callable<[{ app_id: number }], boolean>('Backend.delete_review');
const debug_log = callable<[{ message: string }], boolean>('Backend.debug_log');

const WaitForElement = async (sel: string, parent = document) =>
	[...(await Millennium.findElement(parent, sel))][0];

const WaitForElementTimeout = async (sel: string, parent = document, timeOut = 1000) =>
	[...(await Millennium.findElement(parent, sel, timeOut))][0];

// Опции статуса игры с русской локализацией
const GAME_STATUS_OPTIONS = [
    { value: 'IN_PROGRESS', label: 'В процессе' },
    { value: 'FINISHED', label: 'Пройдена' },
    { value: 'SKIPPED', label: 'Дропнута' }
];

// Компонент модального окна для написания обзора
const ReviewModal: React.FC<{ appId: number, onClose: () => void }> = ({ appId, onClose }) => {
    const [reviewText, setReviewText] = useState<string>("");
    const [rating, setRating] = useState<number>(0);
    const [status, setStatus] = useState<string>('IN_PROGRESS');
    const [loading, setLoading] = useState<boolean>(true);
    const [saving, setSaving] = useState<boolean>(false);

    // Загружаем существующий обзор при открытии модального окна
    useEffect(() => {
        const loadReview = async () => {
            try {
                const reviewData = await get_review({ app_id: appId });
                const data = JSON.parse(reviewData);
                
                if (data.review) setReviewText(data.review);
                if (data.rating) setRating(data.rating);
                if (data.status) setStatus(data.status);
            } catch (error) {
                await debug_log({ message: `Error loading review: ${error}` });
            } finally {
                setLoading(false);
            }
        };

        loadReview();
    }, [appId]);

    // Сохраняем обзор
    const handleSave = async () => {
        setSaving(true);
        try {
            const reviewData = {
                review: reviewText,
                rating: rating,
                status: status
            };

            const success = await save_review({ 
                app_id: appId, 
                review_data: JSON.stringify(reviewData) 
            });

            if (success) {
                await debug_log({ message: "Review saved successfully" });
                onClose();
            } else {
                await debug_log({ message: "Failed to save review" });
            }
        } catch (error) {
            await debug_log({ message: `Error saving review: ${error}` });
        } finally {
            setSaving(false);
        }
    };

    // Удаляем обзор
    const handleDelete = async () => {
        try {
            const success = await delete_review({ app_id: appId });
            if (success) {
                await debug_log({ message: "Review deleted successfully" });
                onClose();
            }
        } catch (error) {
            await debug_log({ message: `Error deleting review: ${error}` });
        }
    };

    if (loading) {
        return (
            <ModalRoot closeModal={onClose}>
                <div>Loading...</div>
            </ModalRoot>
        );
    }

    return (
        <ModalRoot closeModal={onClose}>
            <div style={{ padding: '20px', minWidth: '500px' }}>
                <h2 style={{ marginBottom: '20px' }}>Game Review</h2>
                
                {/* Поле для текста обзора */}
                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                        Review:
                    </label>
                    <textarea
                        value={reviewText}
                        onChange={(e) => setReviewText(e.target.value)}
                        placeholder="Write your game review..."
                        style={{
                            width: '100%',
                            height: '120px',
                            padding: '8px',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            resize: 'vertical',
                            fontFamily: 'inherit'
                        }}
                    />
                </div>

                {/* Поле для оценки */}
                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                        Rating (1-5):
                    </label>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        {[1, 2, 3, 4, 5].map((star) => (
                            <button
                                key={star}
                                onClick={() => setRating(star)}
                                style={{
                                    background: rating >= star ? '#ffd700' : '#ddd',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '30px',
                                    height: '30px',
                                    cursor: 'pointer',
                                    fontSize: '16px'
                                }}
                            >
                                ★
                            </button>
                        ))}
                        <span style={{ marginLeft: '10px' }}>
                            {rating > 0 ? `${rating}/5` : 'Not rated'}
                        </span>
                    </div>
                </div>

                {/* Поле для статуса игры */}
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                        Game Status:
                    </label>
                    <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '8px',
                            border: '1px solid #ccc',
                            borderRadius: '4px',
                            fontSize: '14px'
                        }}
                    >
                        {GAME_STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Кнопки управления */}
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <DialogButton 
                        onClick={handleDelete}
                        style={{ 
                            backgroundColor: '#dc3545', 
                            color: 'white',
                            border: 'none',
                            padding: '8px 16px',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        Delete Review
                    </DialogButton>
                    <DialogButton 
                        onClick={onClose}
                        style={{ 
                            backgroundColor: '#6c757d', 
                            color: 'white',
                            border: 'none',
                            padding: '8px 16px',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        Cancel
                    </DialogButton>
                    <DialogButton 
                        onClick={handleSave}
                        disabled={saving}
                        style={{ 
                            backgroundColor: '#007bff', 
                            color: 'white',
                            border: 'none',
                            padding: '8px 16px',
                            borderRadius: '4px',
                            cursor: saving ? 'not-allowed' : 'pointer',
                            opacity: saving ? 0.6 : 1
                        }}
                    >
                        {saving ? 'Saving...' : 'Save'}
                    </DialogButton>
                </div>
            </div>
        </ModalRoot>
    );
};

const MAIN_WINDOW_NAME = "SP Desktop_uid0";

async function OnPopupCreation(popup: globals.SteamPopup) {
    await debug_log({ message: `OnPopupCreation called with popup: ${popup?.m_strName}` });
    
    if (popup.m_strName !== MAIN_WINDOW_NAME) {
        await debug_log({ message: `Not main popup, ignoring: ${popup?.m_strName}` });
        return;
    }

    await debug_log({ message: "Main popup detected, initializing..." });
    
    // Ждем готовности MainWindowBrowserManager
    var mwbm = undefined;
    while (!mwbm) {
        await debug_log({ message: "Waiting for MainWindowBrowserManager" });
        try {
            mwbm = MainWindowBrowserManager;
            await debug_log({ message: "MainWindowBrowserManager found" });
        } catch (e) {
            await debug_log({ message: `MainWindowBrowserManager not ready yet: ${e}` });
            await sleep(100);
        }
    }

    await debug_log({ message: "Setting up browser event listener" });

    // Обработчик навигации по страницам
    MainWindowBrowserManager.m_browser.on("finished-request", async (currentURL, previousURL) => {
        const currentPath = MainWindowBrowserManager.m_lastLocation.pathname;
        await debug_log({ message: `Browser navigation detected. Path: ${currentPath}, URL: ${currentURL}, Previous: ${previousURL}` });
        
        // Добавляем кнопку обзора только на страницах игр
        if (currentPath.startsWith("/library/app/")) {
            await debug_log({ message: "Game page detected, processing..." });
            
            const appIdMatch = currentPath.match(/\/library\/app\/(\d+)/);
            await debug_log({ message: `AppId match result: ${JSON.stringify(appIdMatch)}` });
            
            if (appIdMatch) {
                const appId = parseInt(appIdMatch[1]);
                await debug_log({ message: `Extracted appId: ${appId}` });
                
                try {
                    // Ищем кнопку настроек игры (как в примере)
                    await debug_log({ message: "Looking for game settings button..." });
                    
                    const gameSettingsButton = await WaitForElement(`div.${findModule(e => e.InPage).InPage} div.${findModule(e => e.AppButtonsContainer).AppButtonsContainer} > div.${findModule(e => e.MenuButtonContainer).MenuButtonContainer}:not([role="button"])`, popup.m_popup.document);
                    
                    await debug_log({ message: `Game settings button found: ${!!gameSettingsButton}` });
                    
                    if (gameSettingsButton) {
                        await debug_log({ message: `Game settings button parent: ${!!gameSettingsButton.parentNode}` });
                        
                        // Проверяем, не существует ли уже кнопка обзора (используем уникальное имя класса)
                        const existingReviewButton = gameSettingsButton.parentNode.querySelector('div.steam-game-helper-review-button');
                        await debug_log({ message: `Existing review button check: ${!!existingReviewButton}` });
                        
                        if (!existingReviewButton) {
                            await debug_log({ message: "Creating review button..." });
                            
                            // Создаем кнопку обзора по образцу примера
                            const reviewButton = gameSettingsButton.cloneNode(true) as HTMLElement;
                            await debug_log({ message: `Review button cloned: ${!!reviewButton}` });
                            
                            reviewButton.classList.add("steam-game-helper-review-button");
                            if (reviewButton.firstChild) {
                                (reviewButton.firstChild as HTMLElement).innerHTML = "📝";
                            }
                            reviewButton.title = "Write Review";
                            
                            await debug_log({ message: "Review button configured, inserting..." });
                            
                            gameSettingsButton.parentNode.insertBefore(reviewButton, gameSettingsButton.nextSibling);
                            
                            await debug_log({ message: "Review button inserted successfully" });

                            // Добавляем обработчик клика
                            reviewButton.addEventListener("click", async () => {
                                await debug_log({ message: `Review button clicked for appId: ${appId}` });
                                
                                showModal(
                                    <ReviewModal 
                                        appId={appId} 
                                        onClose={async () => {
                                            await debug_log({ message: "Review modal closed" });
                                            // Модальное окно закроется автоматически
                                        }} 
                                    />,
                                    popup.m_popup.window, 
                                    { 
                                        strTitle: "Game Review", 
                                        bHideMainWindowForPopouts: false, 
                                        bForcePopOut: true, 
                                        popupHeight: 600, 
                                        popupWidth: 600 
                                    }
                                );
                            });
                            
                            await debug_log({ message: "Review button click handler added" });
                        } else {
                            await debug_log({ message: "Review button already exists, skipping creation" });
                        }
                    } else {
                        await debug_log({ message: "Game settings button not found" });
                    }
                } catch (error) {
                    await debug_log({ message: `Error processing game page: ${error}` });
                }
            } else {
                await debug_log({ message: "No appId found in path" });
            }
        } else {
            await debug_log({ message: "Not a game page, skipping" });
        }
    });
    
    await debug_log({ message: "Browser event listener setup complete" });
}

export default async function PluginMain() {
    await debug_log({ message: "Frontend startup" });
    
    await debug_log({ message: "Waiting for services to initialize..." });
    
    await App.WaitForServicesInitialized();
    
    await debug_log({ message: "Services initialized, checking for existing popup..." });

    const doc = g_PopupManager.GetExistingPopup(MAIN_WINDOW_NAME);
    await debug_log({ message: `Existing popup found: ${!!doc}` });
    
	if (doc) {
        await debug_log({ message: "Processing existing popup..." });
		OnPopupCreation(doc);
	}

    await debug_log({ message: "Adding popup creation callback..." });
    
	g_PopupManager.AddPopupCreatedCallback(OnPopupCreation);
	
	await debug_log({ message: "Plugin initialization complete" });
}
