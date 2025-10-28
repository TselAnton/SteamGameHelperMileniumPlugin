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
declare const uiStore: any;

// Backend функции для работы с обзорами
const get_review = callable<[{ app_id: number }], string>('Backend.get_review');
const save_review = callable<[{ app_id: number, review_data: string }], boolean>('Backend.save_review');
const delete_review = callable<[{ app_id: number }], boolean>('Backend.delete_review');
const debug_log = callable<[{ message: string }], boolean>('Backend.debug_log');
const get_game_image_base64 = callable<[{ app_id: string, file_name: string }], string | null>('Backend.get_game_image_base64');
const get_game_ratings = callable<[{ show_all_games?: boolean, selected_year?: string | number }], string>('Backend.get_game_ratings');
const get_current_year = callable<[{}], string>('Backend.def get_current_year');

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
    header_filename?: string;
    installed?: boolean;
}

// Интерфейс для рейтинга игры
interface GameRating {
    app_id: number;
    display_name: string;
    rating: number;
    review: string;
    status: string;
    finished_at?: number;
    icon_hash?: string;
}

// Компонент колеса фортуны
const FortuneWheelModal: React.FC<{ games: GameInfo[], onClose: () => void }> = ({ games, onClose }) => {
    const [isSpinning, setIsSpinning] = useState<boolean>(false);
    const [selectedGame, setSelectedGame] = useState<GameInfo | null>(null);
    const [wheelRotation, setWheelRotation] = useState<number>(0);
    const [showResult, setShowResult] = useState<boolean>(false);
    const [selectedGameImageUrl, setSelectedGameImageUrl] = useState<string | null>(null);
    const [showInstalledOnly, setShowInstalledOnly] = useState<boolean>(true);

    // Эффект для обработки случая, когда нет установленных игр
    useEffect(() => {
        if (showInstalledOnly && games.length > 0) {
            const installedGames = games.filter(game => game.installed);
            if (installedGames.length === 0) {
                setShowInstalledOnly(false);
                alert("No installed games found in this collection. Showing all games instead.");
            }
        }
    }, [showInstalledOnly, games]);

    // Функция для загрузки картинки игры в base64
    const loadGameImage = async (appId: number, fileName: string): Promise<string | null> => {
        try {
            const imageBase64 = await get_game_image_base64({ app_id: appId.toString(), file_name: fileName });
            await debug_log({ message: `Image base64 for app ${appId}, file ${fileName}: ${imageBase64 ? 'received' : 'null'}` });
            return imageBase64;
        } catch (error) {
            await debug_log({ message: `Error getting image base64 for app ${appId}: ${error}` });
            return null;
        }
    };

    const spinWheel = () => {
        if (isSpinning || filteredGames.length === 0) {
            if (filteredGames.length === 0 && showInstalledOnly) {
                // Показываем уведомление пользователю
                alert("No installed games found in this collection. Please uncheck 'Show only installed games' to see all games.");
            }
            return;
        }

        setIsSpinning(true);
        setShowResult(false);
        setSelectedGame(null);
        setSelectedGameImageUrl(null);

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
        const sectorIndex = Math.floor(arrowAngle / anglePerGame) % filteredGames.length;
        const chosenGame = filteredGames[sectorIndex];
 
        // Показываем результат после завершения анимации
        setTimeout(async () => {
            setSelectedGame(chosenGame);
            setShowResult(true);
            setIsSpinning(false);
            
            // Загружаем картинку выбранной игры
            if (chosenGame.header_filename) {
                await debug_log({ message: `Loading image for game: ${chosenGame.display_name}, appId: ${chosenGame.appid}, filename: ${chosenGame.header_filename}` });
                const imageUrl = await loadGameImage(chosenGame.appid, chosenGame.header_filename);
                await debug_log({ message: `>> Final image url: ${imageUrl}` });
                setSelectedGameImageUrl(imageUrl);
            } else {
                await debug_log({ message: `No header_filename for game: ${chosenGame.display_name}` });
                setSelectedGameImageUrl(null);
            }
        }, WHEEL_SPIN_DURATION);
    };

    const viewGame = () => {
        if (selectedGame) {
            SteamUIStore.Navigate(`/library/app/${selectedGame.appid}`);
            onClose();
        }
    };

    // Фильтруем игры по статусу установки
    const filteredGames = showInstalledOnly ? games.filter(game => game.installed) : games;

    // Вычисляем угол для каждой игры
    const anglePerGame = 360 / filteredGames.length;
    
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
                                filteredGames.map((_, index) => {
                                    const hue = (index * 360) / filteredGames.length;
                                    return `hsl(${hue}, 63%, 52%) ${index * anglePerGame}deg ${(index + 1) * anglePerGame}deg`;
                                }).join(', ') + ')'
                        }}>
                            {/* Секторы с названиями игр */}
                            {filteredGames.map((game, index) => {
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
                                <h3 style={{ marginBottom: '5px', color: '#28a745' }}>Selected Game!</h3>
                                {selectedGameImageUrl ? (
                                    <img 
                                        src={selectedGameImageUrl} 
                                        alt={selectedGame.display_name}
                                        style={{
                                            width: '200px',
                                            height: '300px',
                                            objectFit: 'cover',
                                            borderRadius: '8px',
                                            marginBottom: '10px'
                                        }}
                                   />
                                ) : (
                                    <div style={{
                                        width: '200px',
                                        height: '300px',
                                        backgroundColor: '#333',
                                        borderRadius: '8px',
                                        marginBottom: '10px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        color: '#666',
                                        fontSize: '12px'
                                    }}>
                                        No Image
                                    </div>
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
                
                {/* Переключатель режима отображения */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    marginTop: '15px',
                    justifyContent: 'center'
                }}>
                    <label style={{
                        fontSize: '14px',
                        fontWeight: 'bold'
                    }}>
                       Installed games only:
                    </label>
                    <input
                        type="checkbox"
                        defaultChecked={true}
                        checked={showInstalledOnly}
                        onChange={(e) => setShowInstalledOnly(e.target.checked)}
                        style={{
                            width: '18px',
                            height: '18px',
                            cursor: 'pointer'
                        }}
                    />
                    {/* Отображение количества игр */}
                    {` (Total: ${showInstalledOnly ? filteredGames.length : games.length})`}
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
                        disabled={isSpinning || filteredGames.length === 0}
                        style={{
                            backgroundColor: isSpinning ? '#6c757d' : (filteredGames.length === 0 ? '#dc3545' : '#007bff'),
                            color: 'white',
                            border: 'none',
                            padding: '10px 20px',
                            borderRadius: '4px',
                            cursor: isSpinning ? 'not-allowed' : (filteredGames.length === 0 ? 'not-allowed' : 'pointer'),
                            opacity: isSpinning ? 0.6 : (filteredGames.length === 0 ? 0.6 : 1),
                            fontSize: '16px',
                            fontWeight: 'bold'
                        }}
                    >
                        {isSpinning ? 'Spinning...' : (filteredGames.length === 0 ? 'No Games Available' : 'Spin')}
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

    // Автоматически устанавливаем текущую дату при изменении статуса на FINISHED или SKIPPED
    useEffect(() => {
        if ((status === 'FINISHED' || status === 'SKIPPED') && !finishedDate) {
            const today = new Date();
            const dateString = today.toISOString().split('T')[0];
            setFinishedDate(dateString);
        }
    }, [status, finishedDate]);

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

            // Добавляем дату прохождения для всех статусов кроме IN_PROGRESS
            if (finishedDate && status !== 'IN_PROGRESS') {
                reviewData.finished_at_formatted = finishedDate;
                await debug_log({ message: `Adding finished date: ${finishedDate} for status: ${status}` });
            }

            const collectionGames = collectionStore.GetCollection(uiStore.currentGameListSelection.strCollectionId);
            if (collectionGames && collectionGames.allApps) {
                const gameData = collectionGames.allApps
                    .map((app: any) => ({
                        appid: app.appid,
                        display_name: app.display_name,
                        icon_hash: app.icon_hash
                    }))
                    .find((app: any) => app.appid === appId);

                reviewData.display_name = gameData.display_name;
                reviewData.icon_hash = gameData.icon_hash;
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
        if (rating <= 4.5) return '#10A532'; // желтый
        return '#5281E6'; // зеленый
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
            <div style={{
                padding: '10px',
                minWidth: '500px',
                minHeight: '500px',
                maxHeight: '80vh',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                overflowY: 'auto'
            }}>
                <h2 style={{ margin: 0, marginBottom: '20px' }}>Game Review</h2>
                
                {/* Поле для текста обзора */}
                <div style={{ marginBottom: '20px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>
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
                            border: '1px solid #444',
                            borderRadius: '4px',
                            backgroundColor: '#2a2a2a',
                            color: '#fff',
                            resize: 'vertical',
                            fontFamily: 'inherit',
                            fontSize: '14px'
                        }}
                    />
                </div>

                {/* Поле для оценки */}
                <div style={{ marginBottom: '15px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>
                        Rating (1-5):
                    </label>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <input
                            type="range"
                            min="1"
                            max="5"
                            step="0.1"
                            value={rating || 1}
                            onChange={(e) => setRating(parseFloat(e.target.value))}
                            style={{
                                flex: 1,
                                height: '6px',
                                background: 'linear-gradient(to right, #dc3545, #ffc107, #28a745)',
                                outline: 'none',
                                borderRadius: '3px',
                                cursor: 'pointer'
                            }}
                        />
                        <span style={{
                            minWidth: '60px',
                            textAlign: 'center',
                            fontWeight: 'bold',
                            fontSize: '16px',
                            color: getRatingColor(rating || 1)
                        }}>
                            {rating > 0 ? `${rating}/5` : '1/5'}
                        </span>
                    </div>
                </div>

                {/* Поле для статуса игры и даты */}
                <div style={{ marginBottom: '30px' }}>
                    <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-end' }}>
                        {/* Селектор статуса */}
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '14px' }}>
                                Game Status:
                            </label>
                            <select
                                value={status}
                                onChange={(e) => setStatus(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '10px',
                                    border: '1px solid #444',
                                    borderRadius: '4px',
                                    backgroundColor: '#2a2a2a',
                                    color: '#fff',
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

                        {/* Кнопка даты */}
                        {(status === 'FINISHED' || status === 'SKIPPED') && (
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '14px' }}>
                                    {status === 'FINISHED' ? 'Finished Date:' : 'Skipped Date:'}
                                </label>
                                <input
                                    type="date"
                                    value={finishedDate}
                                    onChange={(e) => setFinishedDate(e.target.value)}
                                    style={{
                                        width: '95%',
                                        padding: '10px',
                                        border: '1px solid #444',
                                        borderRadius: '4px',
                                        backgroundColor: '#2a2a2a',
                                        color: '#fff',
                                        fontSize: '14px'
                                    }}
                                />
                            </div>
                        )}

                        {/* Кнопка даты для IN_PROGRESS */}
                        {status === 'IN_PROGRESS' && (
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '14px' }}>
                                    Started Date:
                                </label>
                                <div
                                    style={{
                                        width: '100%',
                                        padding: '10px',
                                        border: '1px solid #666',
                                        borderRadius: '4px',
                                        backgroundColor: '#666',
                                        color: '#ccc',
                                        fontSize: '14px',
                                        textAlign: 'center'
                                    }}
                                >
                                    {finishedDate ? new Date(finishedDate).toLocaleDateString() : 'Not started'}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Кнопки управления */}
                <div style={{
                    display: 'flex',
                    gap: '10px',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    
                }}>
                    <DialogButton
                        onClick={handleSave}
                        disabled={saving || !hasChanges()}
                        style={{
                            backgroundColor: saved ? '#28a745' : '#007bff',
                            color: 'white',
                            border: 'none',
                            padding: '10px 20px',
                            borderRadius: '4px',
                            cursor: (saving || !hasChanges()) ? 'not-allowed' : 'pointer',
                            opacity: (saving || !hasChanges()) ? 0.6 : 1,
                            fontSize: '14px',
                            fontWeight: 'bold'
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
                            padding: '15px 20px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '14px',
                            fontWeight: 'bold'
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

// Интерфейс для группированных данных
interface GroupedRatingsData {
    all_ratings: GameRating[];
    ratings: GameRating[];
    grouped_by_status: { [status: string]: GameRating[] };
    status_order: string[];
    years: number[];
    total_games: number;
}

// Компонент модального окна для отображения рейтингов
const GameRatingsModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [data, setData] = useState<GroupedRatingsData | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [showAllGames, setShowAllGames] = useState<boolean>(true);
    const [selectedYear, setSelectedYear] = useState<string | number>('all');
    const [years, setYears] = useState<number[]>([]);

    // Загружаем рейтинги при открытии модального окна или изменении фильтров
    useEffect(() => {
        const loadRatings = async () => {
            try {
                setLoading(true);

                // Подготавливаем параметры для backend
                const params: any = { show_all_games: showAllGames };
                if (selectedYear !== 'all') {
                    params.selected_year = selectedYear;
                }

                await debug_log({ message: `Loading ratings with params: ${JSON.stringify(params)}` });

                // Получаем рейтинги игр с фильтрацией
                const ratingsData = await get_game_ratings(params);
                const parsedData = JSON.parse(ratingsData) as GroupedRatingsData;

                setData(parsedData);
                setYears(parsedData.years || []);

                await debug_log({ message: `Loaded ${parsedData.total_games} game ratings for ${parsedData.years?.length || 0} years` });
            } catch (error) {
                await debug_log({ message: `Error loading game ratings: ${error}` });
            } finally {
                setLoading(false);
            }
        };

        loadRatings();
    }, [showAllGames, selectedYear]);

    // Получаем цвет для рейтинга
    const getRatingColor = (rating: number) => {
        if (rating <= 2.0) return '#dc3545'; // красный
        if (rating <= 3.5) return '#ffc107'; // желтый
        if (rating <= 4.5) return '#28a745'; // зеленый
        return '#007bff'; // синий
    };

    // Получаем цвет для статуса
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'FINISHED': return '#28a745';
            case 'IN_PROGRESS': return '#007bff';
            case 'SKIPPED': return '#6c757d';
            default: return '#6c757d';
        }
    };

    const formatDate = (timestamp: number) => {
        if (!timestamp) return '';
        const date = new Date(timestamp * 1000);
        return date.toLocaleDateString();
    };

    if (loading) {
        return (
            <ModalRoot closeModal={onClose}>
                <div style={{
                    padding: '20px',
                    minWidth: '600px',
                    minHeight: '400px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    Loading game ratings...
                </div>
            </ModalRoot>
        );
    }

    if (!data) {
        return (
            <ModalRoot closeModal={onClose}>
                <div style={{
                    padding: '20px',
                    minWidth: '600px',
                    minHeight: '400px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#666'
                }}>
                    No data available
                </div>
            </ModalRoot>
        );
    }

    return (
        <ModalRoot closeModal={onClose}>
            <div style={{
                padding: '20px',
                minWidth: '900px',
                minHeight: '700px',
                maxHeight: '80vh',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
            }}>
                {/* Заголовок и переключатели */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '20px',
                    marginTop: '20px',
                    flexWrap: 'wrap',
                    gap: '15px'
                }}>
                    <h2 style={{ margin: 0 }}>Game Ratings</h2>

                    <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
                        {/* Переключатель фильтра игр */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <label style={{ fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                Show not finished games:
                            </label>
                            <input
                                type="checkbox"
                                checked={showAllGames}
                                onChange={(e) => setShowAllGames(e.target.checked)}
                                style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                            />
                        </div>

                        {/* Селектор года */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <label style={{ fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                                Year:
                            </label>
                            <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(e.target.value)}
                                style={{
                                    padding: '5px 10px',
                                    border: '1px solid #ccc',
                                    borderRadius: '4px',
                                    fontSize: '14px',
                                    backgroundColor: '#2a2a2a',
                                    color: '#fff'
                                }}
                            >
                                <option value="all">За всё время</option>
                                {years.map(year => (
                                    <option key={year} value={year}>{year}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Список рейтингов */}
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    border: '1px solid #333',
                    borderRadius: '4px'
                }}>
                    {data.total_games === 0 ? (
                        <div style={{
                            padding: '20px',
                            textAlign: 'center',
                            color: '#666'
                        }}>
                            No games with ratings found. Write some reviews first!
                        </div>
                    ) : (
                        data.status_order.map(status => {
                            const games = data.grouped_by_status[status];
                            if (!games || games.length === 0) return null;

                            return (
                                <div key={status}>
                                    {/* Заголовок группы статуса */}
                                    <div style={{
                                        padding: '10px 15px',
                                        backgroundColor: '#2a2a2a',
                                        borderBottom: '1px solid #444',
                                        fontSize: '16px',
                                        fontWeight: 'bold',
                                        color: '#fff'
                                    }}>
                                        {status === 'FINISHED' ? 'Пройденные' :
                                         status === 'SKIPPED' ? 'Пропущенные' :
                                         status === 'IN_PROGRESS' ? 'В процессе' : status} ({games.length} games)
                                    </div>

                                    {/* Список игр в группе */}
                                    {games.map((game) => (
                                        <div
                                            key={game.app_id}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                padding: '15px',
                                                borderBottom: '1px solid #333',
                                                backgroundColor: '#1a1a1a',
                                                cursor: 'pointer'
                                            }}
                                            onClick={() => {
                                                SteamUIStore.Navigate(`/library/app/${game.app_id}`);
                                                onClose();
                                            }}
                                        >
                                            {/* Иконка игры */}
                                            <div style={{
                                                width: '32px',
                                                height: '32px',
                                                marginRight: '15px',
                                                borderRadius: '4px',
                                                overflow: 'hidden',
                                                backgroundColor: '#333',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center'
                                            }}>
                                                {game.icon_hash ? (
                                                    <img
                                                        src={`http://media.steampowered.com/steamcommunity/public/images/apps/${game.app_id}/${game.icon_hash}.jpg`}
                                                        alt={game.display_name}
                                                        style={{
                                                            width: '100%',
                                                            height: '100%',
                                                            objectFit: 'cover'
                                                        }}
                                                        onError={(e) => {
                                                            // Скрываем изображение при ошибке загрузки
                                                            (e.target as HTMLElement).style.display = 'none';
                                                        }}
                                                    />
                                                ) : (
                                                    <div style={{
                                                        width: '100%',
                                                        height: '100%',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        color: '#666',
                                                        fontSize: '12px'
                                                    }}>
                                                        ?
                                                    </div>
                                                )}
                                            </div>

                                            {/* Рейтинг */}
                                            <div style={{
                                                minWidth: '80px',
                                                textAlign: 'center',
                                                marginRight: '15px'
                                            }}>
                                                <div style={{
                                                    fontSize: '24px',
                                                    fontWeight: 'bold',
                                                    color: getRatingColor(game.rating)
                                                }}>
                                                    {game.rating}/5
                                                </div>
                                            </div>

                                            {/* Название игры */}
                                            <div style={{
                                                flex: 1,
                                                marginRight: '15px'
                                            }}>
                                                <div style={{
                                                    fontSize: '16px',
                                                    fontWeight: 'bold',
                                                    marginBottom: '4px'
                                                }}>
                                                    {game.display_name}
                                                </div>
                                                {game.review && (
                                                    <div style={{
                                                        fontSize: '12px',
                                                        color: '#aaa',
                                                        maxHeight: '40px',
                                                        overflow: 'hidden',
                                                        textOverflow: 'ellipsis',
                                                        whiteSpace: 'nowrap'
                                                    }}>
                                                        {game.review}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Статус и дата */}
                                            <div style={{
                                                minWidth: '120px',
                                                textAlign: 'center'
                                            }}>
                                                <div style={{
                                                    padding: '4px 8px',
                                                    borderRadius: '12px',
                                                    fontSize: '12px',
                                                    fontWeight: 'bold',
                                                    backgroundColor: getStatusColor(game.status),
                                                    color: 'white',
                                                    display: 'inline-block',
                                                    marginBottom: '4px'
                                                }}>
                                                    {GAME_STATUS_OPTIONS.find((option) => option.value === game.status)?.label}
                                                </div>
                                                <div style={{
                                                    fontSize: '11px',
                                                    color: '#888'
                                                }}>
                                                    {game.finished_at 
                                                        ? game.status === 'FINISHED' 
                                                            ? `Finished: ${formatDate(game.finished_at)}` 
                                                            : `Skipped: ${formatDate(game.finished_at)}` 
                                                        : ''
                                                    }
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Итоговая статистика */}
                <div style={{
                    marginTop: '20px',
                    padding: '15px',
                    backgroundColor: '#2a2a2a',
                    borderRadius: '4px',
                    textAlign: 'center'
                }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-around',
                        alignItems: 'center'
                    }}>
                        <div>
                            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#007bff' }}>
                                {data.total_games}
                            </div>
                            <div style={{ fontSize: '12px', color: '#aaa' }}>
                                Total Games
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#28a745' }}>
                                {data.ratings.filter(g => g.status === 'FINISHED').length}
                            </div>
                            <div style={{ fontSize: '12px', color: '#aaa' }}>
                                Finished
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#6c757d' }}>
                                {data.ratings.filter(g => g.status === 'SKIPPED').length}
                            </div>
                            <div style={{ fontSize: '12px', color: '#aaa' }}>
                                Skipped
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#ffc107' }}>
                                {data.ratings.filter(g => g.status === 'FINISHED').length > 0 ? (data.ratings.filter(g => g.status === 'FINISHED').reduce((sum, game) => sum + game.rating, 0) / data.ratings.filter(g => g.status === 'FINISHED').length).toFixed(1) : '0.0'}
                            </div>
                            <div style={{ fontSize: '12px', color: '#aaa' }}>
                                Avg Finished Rating
                            </div>
                        </div>
                    </div>
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

    // Логируем только основные события для отладки
    await debug_log({ message: "Steam Game Helper plugin initialized" });

    // Добавляем пункт меню "Game Helper" в основную панель навигации Steam
    try {
        await debug_log({ message: "Adding Game Helper menu item to Steam navbar..." });

        // Ищем существующие элементы меню для анализа структуры
        const existingMenuItems = popup.m_popup.document.querySelectorAll('._2Lu3d-5qLmW4i19ysTt2jT._2UyOBeiSdBayaFdRa39N2O');

        if (existingMenuItems.length > 0) {
            await debug_log({ message: `Found ${existingMenuItems.length} existing menu items` });

            // Берем последний элемент меню (обычно "Справка") как ориентир
            const lastMenuItem = existingMenuItems[existingMenuItems.length - 1];
            const parentContainer = lastMenuItem.parentNode;

            // Проверяем, не существует ли уже пункт меню Game Helper
            const existingGameHelperItem = parentContainer.querySelector('.game-helper-menu-item');
            if (existingGameHelperItem) {
                await debug_log({ message: "Game Helper menu item already exists" });
                return;
            }

            // Создаем новый пункт меню Game Helper по точно такой же структуре
            const gameHelperItem = popup.m_popup.document.createElement("div");
            gameHelperItem.className = "_2Lu3d-5qLmW4i19ysTt2jT _2UyOBeiSdBayaFdRa39N2O game-helper-menu-item";

            // Копируем стили из существующего элемента меню
            const referenceItem = existingMenuItems[0];
            if (referenceItem) {
                const computedStyle = window.getComputedStyle(referenceItem);
                gameHelperItem.style.cssText = computedStyle.cssText;
                gameHelperItem.style.cursor = 'pointer';
                gameHelperItem.style.userSelect = 'none';
            }

            // Копируем внутреннюю структуру из существующего элемента меню
            if (referenceItem && referenceItem.children.length > 0) {
                const innerDiv = referenceItem.children[0].cloneNode(true) as HTMLElement;
                const textElement = innerDiv.querySelector('.bSKGlAJG2UVWTsntEJY2v');
                if (textElement) {
                    textElement.textContent = 'Game Helper';
                }
                gameHelperItem.appendChild(innerDiv);
            } else {
                // Fallback структура
                gameHelperItem.innerHTML = `
                    <div class="">
                        <div class="bSKGlAJG2UVWTsntEJY2v">Game Helper</div>
                    </div>
                `;
            }

            // Добавляем обработчик клика для показа меню (альтернатива контекстному меню)
            gameHelperItem.addEventListener("click", async (event) => {
                event.preventDefault();
                event.stopPropagation();
                await debug_log({ message: "Game Helper menu clicked" });

                // Показываем контекстное меню при обычном клике
                showContextMenu(
                    <Menu label="Game Helper">
                        <MenuItem onClick={async () => {
                            await debug_log({ message: "Rating menu clicked" });
                            showModal(
                                <GameRatingsModal onClose={() => {}} />,
                                popup.m_popup.window,
                                {
                                    strTitle: "Game Ratings",
                                    bHideMainWindowForPopouts: false,
                                    bForcePopOut: true,
                                    popupHeight: 800,
                                    popupWidth: 1000
                                }
                            );
                        }}>
                            Rating
                        </MenuItem>
                    </Menu>,
                    gameHelperItem
                );
            });

            // Альтернативный обработчик - двойной клик для отладки
            gameHelperItem.addEventListener("dblclick", async (event) => {
                await debug_log({ message: "Game Helper double-click triggered (fallback)" });
                showModal(
                    <GameRatingsModal onClose={() => {}} />,
                    popup.m_popup.window,
                    {
                        strTitle: "Game Ratings (Fallback)",
                        bHideMainWindowForPopouts: false,
                        bForcePopOut: true,
                        popupHeight: 800,
                        popupWidth: 1000
                    }
                );
            });

            // Вставляем новый пункт меню после последнего элемента
            parentContainer.insertBefore(gameHelperItem, lastMenuItem.nextSibling);
            await debug_log({ message: "Game Helper menu item added successfully" });
        } else {
            await debug_log({ message: "No existing menu items found, trying alternative approach" });

            // Альтернативный подход - ищем контейнер по другому селектору
            const navbarContainer = await WaitForElementTimeout(
                '._1Ky59qmywxOUtNcI1cgmkX._3s0lkohH8wU2do0K1il28Y',
                popup.m_popup.document,
                5000
            );

            if (navbarContainer) {
                // Создаем элемент меню
                const gameHelperItem = popup.m_popup.document.createElement("div");
                gameHelperItem.className = "_2Lu3d-5qLmW4i19ysTt2jT _2UyOBeiSdBayaFdRa39N2O game-helper-menu-item";
                gameHelperItem.innerHTML = `
                    <div class="">
                        <div class="bSKGlAJG2UVWTsntEJY2v">Game Helper</div>
                    </div>
                `;

                // Добавляем контекстное меню
                gameHelperItem.addEventListener("contextmenu", async (event) => {
                    event.preventDefault();

                    showContextMenu(
                        <Menu label="Game Helper">
                            <MenuItem onClick={async () => {
                                showModal(
                                    <GameRatingsModal onClose={() => {}} />,
                                    popup.m_popup.window,
                                    {
                                        strTitle: "Game Ratings",
                                        bHideMainWindowForPopouts: false,
                                        bForcePopOut: true,
                                        popupHeight: 800,
                                        popupWidth: 1000
                                    }
                                );
                            }}>
                                Rating
                            </MenuItem>
                        </Menu>
                    );
                });

                navbarContainer.appendChild(gameHelperItem);
                await debug_log({ message: "Game Helper menu item added via alternative method" });
            } else {
                await debug_log({ message: "Warning: Could not find navbar container" });
            }
        }
    } catch (error) {
        await debug_log({ message: `Error adding Game Helper menu: ${error}` });
    }
    
    // Ждем готовности MainWindowBrowserManager
    var mwbm = undefined;
    while (!mwbm) {
        try {
            mwbm = MainWindowBrowserManager;
        } catch (e) {
            await sleep(100);
        }
    }

    // Обработчик навигации по страницам
    MainWindowBrowserManager.m_browser.on("finished-request", async (currentURL, previousURL) => {
        const currentPath = MainWindowBrowserManager.m_lastLocation.pathname;

        // Добавляем кнопку обзора только на страницах игр
        if (currentPath.startsWith("/library/app/")) {
            const appIdMatch = currentPath.match(/\/library\/app\/(\d+)/);

            if (appIdMatch) {
                const appId = parseInt(appIdMatch[1]);

                try {
                    // Ищем кнопку настроек игры
                    const gameSettingsButton = await WaitForElement(`div.${findModule(e => e.InPage).InPage} div.${findModule(e => e.AppButtonsContainer).AppButtonsContainer} > div.${findModule(e => e.MenuButtonContainer).MenuButtonContainer}:not([role="button"])`, popup.m_popup.document);

                    if (gameSettingsButton) {
                        // Проверяем, не существует ли уже кнопка обзора
                        const existingReviewButton = gameSettingsButton.parentNode.querySelector('div.steam-game-helper-review-button');

                        if (!existingReviewButton) {
                            // Создаем кнопку обзора
                            const reviewButton = gameSettingsButton.cloneNode(true) as HTMLElement;
                            reviewButton.classList.add("steam-game-helper-review-button");
                            if (reviewButton.firstChild) {
                                (reviewButton.firstChild as HTMLElement).innerHTML = "📝";
                            }
                            reviewButton.title = "Write Review";

                            gameSettingsButton.parentNode.insertBefore(reviewButton, gameSettingsButton.nextSibling);

                            // Добавляем обработчик клика
                            reviewButton.addEventListener("click", async () => {
                                showModal(
                                    <ReviewModal
                                        appId={appId}
                                        onClose={() => {}}
                                    />,
                                    popup.m_popup.window,
                                    {
                                        strTitle: "Game Review",
                                        bHideMainWindowForPopouts: false,
                                        bForcePopOut: true,
                                        popupHeight: 580,
                                        popupWidth: 600
                                    }
                                );
                            });
                        }
                    }
                } catch (error) {
                    // Игнорируем ошибки
                }
            }
        } else if (currentPath.startsWith("/library/collection/")) {
            const collectionId = uiStore.currentGameListSelection.strCollectionId;

            try {
                // Ищем кнопку настроек коллекции
                const collectionOptionsButton = await WaitForElement(`div.${findModule(e => e.CollectionOptions).CollectionOptions}`, popup.m_popup.document);

                if (collectionOptionsButton) {
                    // Удаляем существующую кнопку колеса фортуны если она есть
                    const existingWheelButton = collectionOptionsButton.querySelector('button.steam-game-helper-wheel-button');
                    if (existingWheelButton) {
                        existingWheelButton.parentNode?.removeChild(existingWheelButton);
                    }

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

                    // Добавляем обработчик клика
                    wheelButton.addEventListener("click", async () => {
                        try {
                            // Получаем список игр из коллекции
                            const collection = collectionStore.GetCollection(collectionId.replace('%20', ' '));

                            if (collection && collection.allApps) {
                                const games: GameInfo[] = collection.allApps
                                .map((app: any) => ({
                                    appid: app.appid,
                                    display_name: app.display_name,
                                    header_filename: app.library_capsule_filename,
                                    installed: app.installed || (app.per_client_data && app.per_client_data.installed)
                                }));

                                if (games.length > 0) {
                                    showModal(
                                        <FortuneWheelModal
                                            key={`fortune-wheel-${collectionId}-${Date.now()}`}
                                            games={games}
                                            onClose={() => {}}
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
                                }
                            }
                        } catch (error) {
                            // Игнорируем ошибки
                        }
                    });
                }
            } catch (error) {
                // Игнорируем ошибки
            }
        }
    });
}

export default async function PluginMain() {
    await App.WaitForServicesInitialized();

    const doc = g_PopupManager.GetExistingPopup(MAIN_WINDOW_NAME);
	if (doc) {
		OnPopupCreation(doc);
	}

	g_PopupManager.AddPopupCreatedCallback(OnPopupCreation);
}
