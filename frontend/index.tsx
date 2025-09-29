import { callable, findModule, sleep, Millennium, Menu, MenuItem, showContextMenu, DialogButton, TextField, ModalRoot, showModal } from "@steambrew/client";
import { render } from "react-dom";
import * as React from "react";
import { useState, useEffect } from "react";
import type * as globals from "./sharedjscontextglobals";

declare const g_PopupManager: globals.PopupManager;
declare const MainWindowBrowserManager: globals.MainWindowBrowserManager;
declare const App: globals.App;
declare const collectionStore: any;
declare const SteamUIStore: any;

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
    { value: 'SKIPPED', label: 'Пропущена' }
];

// Константы для колеса фортуны
const WHEEL_SPIN_DURATION = 10000; // 10 секунд в миллисекундах

// Интерфейс для игры
interface GameInfo {
    appid: number;
    display_name: string;
    header_image?: string;
}

// Компонент колеса фортуны
const FortuneWheelModal: React.FC<{ games: GameInfo[], onClose: () => void }> = ({ games, onClose }) => {
    const [isSpinning, setIsSpinning] = useState<boolean>(false);
    const [selectedGame, setSelectedGame] = useState<GameInfo | null>(null);
    const [wheelRotation, setWheelRotation] = useState<number>(0);
    const [showResult, setShowResult] = useState<boolean>(false);

    const spinWheel = () => {
        if (isSpinning || games.length === 0) return;
        
        setIsSpinning(true);
        setShowResult(false);
        setSelectedGame(null);
        
        // Генерируем случайное количество оборотов (от 15 до 20 полных оборотов для еще большего ускорения)
        const randomRotations = Math.random() * 8 + 15;
        const finalRotation = wheelRotation + (randomRotations * 360);
        
        setWheelRotation(finalRotation);
        
        // Вычисляем, какой сектор окажется у стрелки (90 градусов, верхняя точка)
        // Нормализуем финальный угол поворота к диапазону 0-360
        const normalizedRotation = finalRotation % 360;
        
        // Поскольку колесо поворачивается по часовой стрелке, а стрелка неподвижна в позиции 90 градусов,
        // нужно вычислить, какой сектор окажется в этой позиции
        // Секторы начинаются с 0 градусов, поэтому нужно учесть смещение
        const arrowAngle = (270 - normalizedRotation + 360) % 360;
        
        // Определяем индекс сектора, который окажется у стрелки
        const sectorIndex = Math.floor(arrowAngle / anglePerGame) % games.length;
        const chosenGame = games[sectorIndex];
 
        // Показываем результат после завершения анимации
        setTimeout(() => {
            setSelectedGame(chosenGame);
            setShowResult(true);
            setIsSpinning(false);
        }, WHEEL_SPIN_DURATION);
    };

    const viewGame = () => {
        if (selectedGame) {
            SteamUIStore.Navigate(`/library/app/${selectedGame.appid}`);
            onClose();
        }
    };

    // Вычисляем угол для каждой игры
    const anglePerGame = 360 / games.length;
    
    return (
        <ModalRoot closeModal={onClose}>
            <div style={{ 
                padding: '20px', 
                minWidth: '800px', 
                minHeight: '600px',
                display: 'flex', 
                flexDirection: 'column',
                alignItems: 'center'
            }}>
                <h2 style={{ marginBottom: '20px' }}>Fortune Wheel - Choose Your Game!</h2>
                
                <div style={{ 
                    display: 'flex', 
                    width: '100%', 
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    {/* Колесо фортуны */}
                    <div style={{ 
                        width: '60%', 
                        display: 'flex', 
                        justifyContent: 'center',
                        alignItems: 'center',
                        position: 'relative'
                    }}>
                        <div style={{
                            width: '400px',
                            height: '400px',
                            borderRadius: '50%',
                            border: '8px solid #333',
                            position: 'relative',
                            overflow: 'hidden',
                            transform: `rotate(${wheelRotation}deg)`,
                            transition: isSpinning ? `transform ${WHEEL_SPIN_DURATION}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)` : 'none',
                            background: 'conic-gradient(' + 
                                games.map((_, index) => {
                                    const hue = (index * 360) / games.length;
                                    return `hsl(${hue}, 63%, 52%) ${index * anglePerGame}deg ${(index + 1) * anglePerGame}deg`;
                                }).join(', ') + ')'
                        }}>
                            {/* Секторы с названиями игр */}
                            {games.map((game, index) => {
                                const angle = index * anglePerGame;
                                const middleAngle = angle + anglePerGame / 2; // Центр сектора
                                const middleAngleRad = (middleAngle * Math.PI) / 180; // Конвертируем в радианы
                                
                                // Вычисляем позицию текста на основе угла (радиус 130px от центра)
                                const radius = 130;
                                const textX = 200 + Math.cos(middleAngleRad) * radius; // 200 - центр колеса
                                const textY = 200 + Math.sin(middleAngleRad) * radius; // 200 - центр колеса
                                
                                // Определяем, нужно ли переворачивать текст для читаемости
                                const isUpsideDown = middleAngle > 90 && middleAngle < 270;
                                
                                return (
                                    <div
                                        key={game.appid}
                                        style={{
                                            position: 'absolute',
                                            left: `${textX}px`,
                                            top: `${textY}px`,
                                            transform: `translate(-50%, -50%) rotate(${isUpsideDown ? middleAngle + 180 : middleAngle}deg)`,
                                            transformOrigin: 'center',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                    >
                                        <span style={{
                                            fontSize: '11px',
                                            fontWeight: 'bold',
                                            color: 'white',
                                            textShadow: '1px 1px 2px rgba(0,0,0,0.8)',
                                            maxWidth: '80px',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            textAlign: 'center'
                                        }}>
                                            {game.display_name}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                        
                        {/* Стрелка */}
                        <div style={{
                            position: 'absolute',
                            top: '-10px',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: '0',
                            height: '0',
                            borderTop: '25px solid rgb(243, 179, 105)',
                            borderLeft: '15px solid transparent',
                            borderRight: '15px solid transparent',
                            zIndex: 100
                        }} />
                    </div>
                    
                    {/* Результат */}
                    <div style={{ 
                        width: '35%', 
                        display: 'flex', 
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        minHeight: '300px'
                    }}>
                        {showResult && selectedGame ? (
                            <div style={{ textAlign: 'center' }}>
                                <h3 style={{ marginBottom: '15px', color: '#28a745' }}>Selected Game!</h3>
                                {selectedGame.header_image && (
                                    <img 
                                        src={selectedGame.header_image} 
                                        alt={selectedGame.display_name}
                                        style={{
                                            width: '200px',
                                            height: '100px',
                                            objectFit: 'cover',
                                            borderRadius: '8px',
                                            marginBottom: '10px'
                                        }}
                                    />
                                )}
                                <h4 style={{ marginBottom: '20px' }}>{selectedGame.display_name}</h4>
                            </div>
                        ) : (
                            <div style={{ textAlign: 'center', color: '#666' }}>
                                <h3>Ready to spin?</h3>
                                <p>Click the Spin button to choose a random game from your collection!</p>
                            </div>
                        )}
                    </div>
                </div>
                
                {/* Кнопки управления */}
                <div style={{ 
                    display: 'flex', 
                    gap: '15px', 
                    marginTop: '20px',
                    justifyContent: 'center'
                }}>
                    <DialogButton 
                        onClick={spinWheel}
                        disabled={isSpinning || games.length === 0}
                        style={{ 
                            backgroundColor: isSpinning ? '#6c757d' : '#007bff', 
                            color: 'white',
                            border: 'none',
                            padding: '10px 20px',
                            borderRadius: '4px',
                            cursor: isSpinning ? 'not-allowed' : 'pointer',
                            opacity: isSpinning ? 0.6 : 1,
                            fontSize: '16px',
                            fontWeight: 'bold'
                        }}
                    >
                        {isSpinning ? 'Spinning...' : 'Spin'}
                    </DialogButton>
                    
                    {showResult && selectedGame && (
                        <DialogButton 
                            onClick={viewGame}
                            style={{ 
                                backgroundColor: '#28a745', 
                                color: 'white',
                                border: 'none',
                                padding: '10px 20px',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '16px',
                                fontWeight: 'bold'
                            }}
                        >
                            View Game
                        </DialogButton>
                    )}
                </div>
            </div>
        </ModalRoot>
    );
};

// Компонент модального окна для написания обзора
const ReviewModal: React.FC<{ appId: number, onClose: () => void }> = ({ appId, onClose }) => {
    const [reviewText, setReviewText] = useState<string>("");
    const [rating, setRating] = useState<number>(0);
    const [status, setStatus] = useState<string>('IN_PROGRESS');
    const [finishedDate, setFinishedDate] = useState<string>("");
    const [createdDate, setCreatedDate] = useState<string>("");
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
                if (data.created_at_formatted) {
                    setCreatedDate(data.created_at_formatted);
                    await debug_log({ message: `Set created date: ${data.created_at_formatted}` });
                }
                if (data.finished_at_formatted) {
                    setFinishedDate(data.finished_at_formatted);
                    await debug_log({ message: `Set finished date: ${data.finished_at_formatted}` });
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
            const reviewData: any = {
                review: reviewText,
                rating: rating,
                status: status
            };

            // Добавляем дату прохождения только если статус FINISHED
            if (status === 'FINISHED' && finishedDate) {
                reviewData.finished_at_formatted = finishedDate;
                await debug_log({ message: `Adding finished date: ${finishedDate}` });
            }

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
                setFinishedDate("");
                setCreatedDate("");
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
            status !== (originalData.status || 'IN_PROGRESS') ||
            finishedDate !== (originalData.finished_at_formatted || '')
        );
    };

    // Сбрасываем состояние при изменениях
    useEffect(() => {
        if (hasChanges()) {
            setSaved(false);
            setDeleted(false);
        }
    }, [reviewText, rating, status, finishedDate]);

    if (loading) {
        return (
            <ModalRoot closeModal={onClose}>
                <div>Loading...</div>
            </ModalRoot>
        );
    }

    return (
        <ModalRoot closeModal={onClose}>
            <div style={{ padding: '10px', minWidth: '500px' }}>
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
                            width: '95%',
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
                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                        Game Status:
                    </label>
                    <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                        style={{
                            width: '97%',
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


                {/* Поле для даты прохождения - только если статус FINISHED */}
                {status === 'FINISHED' && (
                    <div style={{ marginBottom: '15px' }}>
                        <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                            Finished Date:
                        </label>
                        <input
                            type="date"
                            value={finishedDate}
                            onChange={(e) => setFinishedDate(e.target.value)}
                            style={{
                                width: '95%',
                                padding: '8px',
                                border: '1px solid #ccc',
                                borderRadius: '4px',
                                fontSize: '14px'
                            }}
                        />
                    </div>
                )}

                {/* Кнопки управления */}
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', alignItems: 'center' }}>
                    <DialogButton 
                        onClick={handleSave}
                        disabled={saving || !hasChanges()}
                        style={{ 
                            backgroundColor: saved ? '#28a745' : '#007bff', 
                            color: 'white',
                            border: 'none',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            cursor: (saving || !hasChanges()) ? 'not-allowed' : 'pointer',
                            opacity: (saving || !hasChanges()) ? 0.6 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '85%',
                            height: '30px',
                            fontSize: '14px',
                            gap: '5px'
                        }}
                    >
                        {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save'}
                    </DialogButton>
                    <button  
                        onClick={handleDelete}
                        style={{ 
                            backgroundColor: deleted ? '#28a745' : '#dc3545', 
                            color: 'white',
                            border: 'none',
                            padding: '8px 12px',
                            borderRadius: '4px',
                            fontSize: '14px',
                            width: '15%',
                            height: '45px',
                            cursor: 'pointer',
                            
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
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
        await debug_log({ message: `Browser navigation detected. Path: ${currentPath}, Previous: ${previousURL}` });
        
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
                                        popupHeight: 620, 
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
        } else if (currentPath.startsWith("/library/collection/")) {
            const collectionId = uiStore.currentGameListSelection.strCollectionId;
            await debug_log({ message: `Found collectionId: ${collectionId}` });
            
            try {
                // Ищем кнопку настроек коллекции (аналогично кнопке настроек игры)
                await debug_log({ message: "Looking for collection options button..." });
                
                const collectionOptionsButton = await WaitForElement(`div.${findModule(e => e.CollectionOptions).CollectionOptions}`, popup.m_popup.document);
                
                await debug_log({ message: `Collection options button found: ${!!collectionOptionsButton}` });
                
                if (collectionOptionsButton) {
                    // Удаляем существующую кнопку колеса фортуны если она есть
                    const existingWheelButton = collectionOptionsButton.querySelector('button.steam-game-helper-wheel-button');
                    if (existingWheelButton) {
                        await debug_log({ message: "Removing existing fortune wheel button" });
                        existingWheelButton.parentNode?.removeChild(existingWheelButton);
                    }
                    
                    await debug_log({ message: `Creating fortune wheel button for collection: ${collectionId}` });
                    
                    // Создаем кнопку колеса фортуны
                    const wheelButton = popup.m_popup.document.createElement("div");
                    render(
                        <DialogButton 
                            className="steam-game-helper-wheel-button" 
                            style={{
                                width: "40px", 
                                marginLeft: "3px", 
                                marginRight: "3px",
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: 'bold'
                            }}
                        >
                            🎯
                        </DialogButton>, 
                        wheelButton
                    );
                    
                    collectionOptionsButton.insertBefore(wheelButton, collectionOptionsButton.firstChild.nextSibling);
                    
                    await debug_log({ message: "Fortune wheel button inserted successfully" });

                    // Добавляем обработчик клика с замыканием на текущий collectionId
                    wheelButton.addEventListener("click", async () => {
                        await debug_log({ message: `Fortune wheel button clicked for collection: ${collectionId}` });
                        
                        try {
                            // Получаем список игр из коллекции
                            const collection = collectionStore.GetCollection(collectionId.replace('%20', ' '));
                            await debug_log({ message: `Collection found: ${!!collection}` });
                            
                            if (collection && collection.allApps) {
                                const games: GameInfo[] = collection.allApps.map((app: any) => ({
                                    appid: app.appid,
                                    display_name: app.display_name,
                                    header_image: app.header_filename
                                }));
                                
                                await debug_log({ message: `Found ${games.length} games in collection ${collectionId}` });
                                
                                if (games.length > 0) {
                                    showModal(
                                        <FortuneWheelModal 
                                            key={`fortune-wheel-${collectionId}-${Date.now()}`}
                                            games={games} 
                                            onClose={() => {
                                                // Модальное окно закроется автоматически
                                            }} 
                                        />,
                                        popup.m_popup.window, 
                                        { 
                                            strTitle: `Fortune Wheel - ${collectionId}`, 
                                            bHideMainWindowForPopouts: false, 
                                            bForcePopOut: true, 
                                            popupHeight: 734, 
                                            popupWidth: 990 
                                        }
                                    );
                                } else {
                                    await debug_log({ message: "Collection is empty, cannot show fortune wheel" });
                                }
                            } else {
                                await debug_log({ message: "Collection not found or has no games" });
                            }
                        } catch (error) {
                            await debug_log({ message: `Error getting collection games: ${error}` });
                        }
                    });
                    
                    await debug_log({ message: "Fortune wheel button click handler added" });
                } else {
                    await debug_log({ message: "Collection options button not found" });
                }
            } catch (error) {
                await debug_log({ message: `Error processing collection page: ${error}` });
            }
        } else {
            await debug_log({ message: "Not a game or collection page, skipping" });
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
