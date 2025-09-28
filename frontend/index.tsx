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

// Функция для правильного декодирования UTF-8 строк
const decodeUtf8String = (str: string): string => {
    try {
        // Если строка уже корректно декодирована, возвращаем как есть
        if (typeof str !== 'string') return str;
        
        // Проверяем, содержит ли строка Unicode escape-последовательности
        if (str.includes('\\u')) {
            // Декодируем Unicode escape-последовательности
            return str.replace(/\\u[\dA-F]{4}/gi, (match) => {
                return String.fromCharCode(parseInt(match.replace(/\\u/g, ''), 16));
            });
        }
        
        // Если нет escape-последовательностей, возвращаем как есть
        return str;
    } catch (error) {
        console.error('Error decoding UTF-8 string:', error);
        return str; // Возвращаем оригинальную строку в случае ошибки
    }
};

// Функция для принудительного кодирования строки в UTF-8
const forceUtf8Encoding = (str: string): string => {
    try {
        if (typeof str !== 'string') return str;
        
        // Попробуем перекодировать строку через TextEncoder/TextDecoder
        const encoder = new TextEncoder();
        const decoder = new TextDecoder('utf-8');
        const bytes = encoder.encode(str);
        return decoder.decode(bytes);
    } catch (error) {
        console.error('Error forcing UTF-8 encoding:', error);
        return str;
    }
};

// Функция для исправления искаженной кодировки (типа "Ð¢ÐµÑÑ" -> "тест")
const fixCorruptedEncoding = (str: string): string => {
    try {
        if (typeof str !== 'string') return str;
        
        // Проверяем, содержит ли строка типичные символы искаженной кодировки
        if (str.includes('Ð') || str.includes('Ñ') || str.includes('Ð°') || str.includes('Ð¸')) {
            // Попробуем исправить через перекодировку Latin-1 -> UTF-8
            const bytes = new Uint8Array(str.length);
            for (let i = 0; i < str.length; i++) {
                bytes[i] = str.charCodeAt(i) & 0xFF; // Получаем байт
            }
            
            const decoder = new TextDecoder('utf-8');
            const fixed = decoder.decode(bytes);
            
            // Проверяем, стал ли результат лучше (содержит ли кириллицу)
            const cyrillicPattern = /[а-яё]/i;
            if (cyrillicPattern.test(fixed) && !cyrillicPattern.test(str)) {
                return fixed;
            }
        }
        
        return str;
    } catch (error) {
        console.error('Error fixing corrupted encoding:', error);
        return str;
    }
};

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
    const [saved, setSaved] = useState<boolean>(false);
    const [deleted, setDeleted] = useState<boolean>(false);
    const [originalData, setOriginalData] = useState<any>(null);

    // Загружаем существующий обзор при открытии модального окна
    useEffect(() => {
        const loadReview = async () => {
            try {
                const reviewData = await get_review({ app_id: appId });
                await debug_log({ message: `Raw review data received: ${reviewData}` });
                
                const data = JSON.parse(reviewData);
                await debug_log({ message: `Parsed review data: ${JSON.stringify(data)}` });
                
                // Сохраняем оригинальные данные для сравнения
                setOriginalData(data);
                
                if (data.review) {
                    // Применяем все методы декодирования последовательно
                    const step1 = decodeUtf8String(data.review);
                    const step2 = fixCorruptedEncoding(step1);
                    const step3 = forceUtf8Encoding(step2);
                    
                    await debug_log({ message: `Original review text: ${data.review}` });
                    await debug_log({ message: `After decodeUtf8String: ${step1}` });
                    await debug_log({ message: `After fixCorruptedEncoding: ${step2}` });
                    await debug_log({ message: `After forceUtf8Encoding: ${step3}` });
                    
                    setReviewText(step3);
                    await debug_log({ message: `Final review text set: ${step3}` });
                }
                if (data.rating) {
                    setRating(data.rating);
                    await debug_log({ message: `Set rating: ${data.rating}` });
                }
                if (data.status) {
                    setStatus(data.status);
                    await debug_log({ message: `Set status: ${data.status}` });
                }
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

            await debug_log({ message: `Saving review data: ${JSON.stringify(reviewData)}` });

            const success = await save_review({ 
                app_id: appId, 
                review_data: JSON.stringify(reviewData) 
            });

            if (success) {
                await debug_log({ message: "Review saved successfully" });
                setSaved(true);
                setDeleted(false);
                // Обновляем оригинальные данные
                setOriginalData({ review: reviewText, rating: rating, status: status });
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
                setDeleted(true);
                setSaved(false);
                // Очищаем поля
                setReviewText("");
                setRating(0);
                setStatus('IN_PROGRESS');
                setOriginalData({});
            }
        } catch (error) {
            await debug_log({ message: `Error deleting review: ${error}` });
        }
    };

    // Получаем цвет для ползунка рейтинга
    const getRatingColor = (rating: number) => {
        if (rating <= 2.0) return '#dc3545'; // красный
        if (rating <= 3.5) return '#ffc107'; // желтый
        return '#28a745'; // зеленый
    };

    // Проверяем, были ли внесены изменения
    const hasChanges = () => {
        if (!originalData) return true;
        return (
            reviewText !== (originalData.review || '') ||
            rating !== (originalData.rating || 0) ||
            status !== (originalData.status || 'IN_PROGRESS')
        );
    };

    // Сбрасываем состояние при изменениях
    useEffect(() => {
        if (hasChanges()) {
            setSaved(false);
            setDeleted(false);
        }
    }, [reviewText, rating, status]);

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
                        <input
                            type="range"
                            min="1"
                            max="5"
                            step="0.5"
                            value={rating || 1}
                            onChange={(e) => setRating(parseFloat(e.target.value))}
                            style={{
                                flex: 1,
                                height: '20px',
                                background: `linear-gradient(to right, ${getRatingColor(rating || 1)} 0%, ${getRatingColor(rating || 1)} ${((rating || 1) - 1) / 4 * 100}%, #ddd ${((rating || 1) - 1) / 4 * 100}%, #ddd 100%)`,
                                outline: 'none',
                                borderRadius: '10px',
                                cursor: 'pointer'
                            }}
                        />
                        <span style={{ 
                            minWidth: '60px', 
                            textAlign: 'center',
                            fontWeight: 'bold',
                            color: getRatingColor(rating || 1)
                        }}>
                            {rating > 0 ? `${rating}/5` : '1/5'}
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
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', alignItems: 'center' }}>
                    <DialogButton 
                        onClick={handleSave}
                        disabled={saving || !hasChanges()}
                        style={{ 
                            backgroundColor: saved ? '#28a745' : '#007bff', 
                            color: 'white',
                            border: 'none',
                            padding: '8px 16px',
                            borderRadius: '4px',
                            cursor: (saving || !hasChanges()) ? 'not-allowed' : 'pointer',
                            opacity: (saving || !hasChanges()) ? 0.6 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px'
                        }}
                    >
                        {saving ? 'Saving...' : saved ? '✓ Saved' : 'Save'}
                    </DialogButton>
                    <button 
                        onClick={handleDelete}
                        style={{ 
                            backgroundColor: deleted ? '#28a745' : '#dc3545', 
                            color: 'white',
                            border: 'none',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px'
                        }}
                        title={deleted ? "Review deleted" : "Delete review"}
                    >
                        {deleted ? '🗑️✓' : '🗑️'}
                    </button>
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
                                        onClose={() => {
                                            // Модальное окно закроется автоматически без сохранения
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
