"""
Backend for Steam Game Review Writer Plugin
Manages saving and loading game reviews to local files
"""

import Millennium, PluginUtils  # type: ignore
import os
import json
from typing import Optional, Dict, Any
from pathlib import Path

logger = PluginUtils.Logger()

class ReviewManager:
    """Manager for working with game reviews"""
    
    def __init__(self, reviews_dir: str = None):
        """
        Initialize review manager
        
        Args:
            reviews_dir: Directory for storing review files
        """
        if reviews_dir is None:
            reviews_dir = os.path.join(PLUGIN_BASE_DIR, "reviews")
        self.reviews_dir = Path(reviews_dir)
        self.reviews_dir.mkdir(exist_ok=True)
        logger.log(f"ReviewManager initialized with directory: {self.reviews_dir}")
    
    def get_review_file_path(self, game_id: str) -> Path:
        """
        Get path to review file for specific game
        
        Args:
            game_id: Game identifier
            
        Returns:
            Path: Path to review file
        """
        file_path = self.reviews_dir / f"review_{game_id}.txt"
        logger.log(f"Getting review file path for game {game_id}: {file_path}")
        return file_path
    
    def save_review(self, game_id: str, game_name: str, review_text: str) -> bool:
        """
        Save game review to file
        
        Args:
            game_id: Game identifier
            game_name: Game name
            review_text: Review text
            
        Returns:
            bool: True if saving was successful
        """
        logger.log(f"Attempting to save review for game {game_id} ({game_name})")
        logger.log(f"Review text length: {len(review_text)} characters")
        
        try:
            review_file = self.get_review_file_path(game_id)
            
            # Create review data structure
            review_data = {
                "game_id": game_id,
                "game_name": game_name,
                "review_text": review_text,
                "timestamp": self._get_timestamp()
            }
            
            logger.log(f"Saving review to file: {review_file}")
            
            # Save to file
            with open(review_file, 'w', encoding='utf-8') as f:
                f.write(f"Game Review: {game_name}\n")
                f.write(f"Game ID: {game_id}\n")
                f.write(f"Created: {review_data['timestamp']}\n")
                f.write("-" * 50 + "\n\n")
                f.write(review_text)
            
            logger.log(f"Successfully saved review for game {game_id}")
            return True
            
        except Exception as e:
            logger.log(f"Error saving review for game {game_id}: {e}")
            return False
    
    def load_review(self, game_id: str) -> Optional[str]:
        """
        Load game review from file
        
        Args:
            game_id: Game identifier
            
        Returns:
            Optional[str]: Review text or None if file not found
        """
        logger.log(f"Attempting to load review for game {game_id}")
        
        try:
            review_file = self.get_review_file_path(game_id)
            
            if not review_file.exists():
                logger.log(f"Review file not found for game {game_id}")
                return None
            
            logger.log(f"Loading review from file: {review_file}")
            
            with open(review_file, 'r', encoding='utf-8') as f:
                content = f.read()
                
                # Extract only review text (after separator)
                parts = content.split("-" * 50)
                if len(parts) > 1:
                    review_text = parts[1].strip()
                    logger.log(f"Successfully loaded review for game {game_id} ({len(review_text)} characters)")
                    return review_text
                else:
                    logger.log(f"Loaded full content for game {game_id} ({len(content)} characters)")
                    return content
                    
        except Exception as e:
            logger.log(f"Error loading review for game {game_id}: {e}")
            return None
    
    def delete_review(self, game_id: str) -> bool:
        """
        Delete game review
        
        Args:
            game_id: Game identifier
            
        Returns:
            bool: True if deletion was successful
        """
        logger.log(f"Attempting to delete review for game {game_id}")
        
        try:
            review_file = self.get_review_file_path(game_id)
            
            if review_file.exists():
                logger.log(f"Deleting review file: {review_file}")
                review_file.unlink()
                logger.log(f"Successfully deleted review for game {game_id}")
                return True
            else:
                logger.log(f"Review file not found for game {game_id}")
                return False
            
        except Exception as e:
            logger.log(f"Error deleting review for game {game_id}: {e}")
            return False
    
    def has_review(self, game_id: str) -> bool:
        """
        Check if review exists for game
        
        Args:
            game_id: Game identifier
            
        Returns:
            bool: True if review exists
        """
        review_file = self.get_review_file_path(game_id)
        exists = review_file.exists()
        logger.log(f"Checking if review exists for game {game_id}: {exists}")
        return exists
    
    def get_all_reviews(self) -> Dict[str, Dict[str, Any]]:
        """
        Get all reviews
        
        Returns:
            Dict[str, Dict[str, Any]]: Dictionary with all reviews
        """
        logger.log("Getting all reviews...")
        reviews = {}
        
        try:
            for review_file in self.reviews_dir.glob("review_*.txt"):
                game_id = review_file.stem.replace("review_", "")
                
                with open(review_file, 'r', encoding='utf-8') as f:
                    content = f.read()
                    
                # Parse metadata from header
                lines = content.split('\n')
                game_name = lines[0].replace("Game Review: ", "")
                
                reviews[game_id] = {
                    "game_name": game_name,
                    "has_review": True,
                    "file_path": str(review_file)
                }
                
                logger.log(f"Found review for game {game_id}: {game_name}")
                
        except Exception as e:
            logger.log(f"Error getting list of reviews: {e}")
        
        logger.log(f"Total reviews found: {len(reviews)}")
        return reviews
    
    def _get_timestamp(self) -> str:
        """Get current date and time as string"""
        from datetime import datetime
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


# Global review manager instance (will be initialized in Plugin._load)
review_manager = None


def save_review(game_id: str, game_name: str, review_text: str) -> bool:
    """
    Функция для сохранения обзора (для использования из frontend)
    
    Args:
        game_id: Идентификатор игры
        game_name: Название игры
        review_text: Текст обзора
        
    Returns:
        bool: True если сохранение прошло успешно
    """
    if review_manager is None:
        return False
    return review_manager.save_review(game_id, game_name, review_text)


def load_review(game_id: str) -> Optional[str]:
    """
    Функция для загрузки обзора (для использования из frontend)
    
    Args:
        game_id: Идентификатор игры
        
    Returns:
        Optional[str]: Текст обзора или None если не найден
    """
    if review_manager is None:
        return None
    return review_manager.load_review(game_id)


def delete_review(game_id: str) -> bool:
    """
    Функция для удаления обзора (для использования из frontend)
    
    Args:
        game_id: Идентификатор игры
        
    Returns:
        bool: True если удаление прошло успешно
    """
    if review_manager is None:
        return False
    return review_manager.delete_review(game_id)


def has_review(game_id: str) -> bool:
    """
    Функция для проверки существования обзора (для использования из frontend)
    
    Args:
        game_id: Идентификатор игры
        
    Returns:
        bool: True если обзор существует
    """
    if review_manager is None:
        return False
    return review_manager.has_review(game_id)


class Backend:
    """Backend API для взаимодействия с frontend"""
    
    @staticmethod
    def save_review(game_id: str, game_name: str, review_text: str) -> bool:
        """Сохранить обзор игры"""
        logger.log(f"save_review() called for game {game_id}")
        if review_manager is None:
            logger.log("ReviewManager not initialized")
            return False
        return review_manager.save_review(game_id, game_name, review_text)
    
    @staticmethod
    def load_review(game_id: str) -> str:
        """Загрузить обзор игры"""
        logger.log(f"load_review() called for game {game_id}")
        if review_manager is None:
            logger.log("ReviewManager not initialized")
            return ""
        result = review_manager.load_review(game_id)
        return result if result else ""
    
    @staticmethod
    def delete_review(game_id: str) -> bool:
        """Удалить обзор игры"""
        logger.log(f"delete_review() called for game {game_id}")
        if review_manager is None:
            logger.log("ReviewManager not initialized")
            return False
        return review_manager.delete_review(game_id)
    
    @staticmethod
    def has_review(game_id: str) -> bool:
        """Проверить существование обзора"""
        logger.log(f"has_review() called for game {game_id}")
        if review_manager is None:
            logger.log("ReviewManager not initialized")
            return False
        return review_manager.has_review(game_id)
    
    @staticmethod
    def get_all_reviews() -> str:
        """Получить все обзоры в JSON формате"""
        logger.log("get_all_reviews() called")
        if review_manager is None:
            logger.log("ReviewManager not initialized")
            return "{}"
        all_reviews = review_manager.get_all_reviews()
        return json.dumps(all_reviews, ensure_ascii=False)
    
    @staticmethod
    def get_config() -> str:
        """Получить конфигурацию плагина"""
        logger.log("get_config() called")
        try:
            config_path = os.path.join(PLUGIN_BASE_DIR, "config.json")
            if os.path.exists(config_path):
                with open(config_path, 'r', encoding='utf-8') as f:
                    return f.read()
        except NameError:
            # PLUGIN_BASE_DIR не определен (тестирование)
            logger.log("PLUGIN_BASE_DIR not defined, using default config")
        return '{"max_review_length": 5000, "reviews_directory": "reviews", "auto_save": true, "show_character_count": true}'


class Plugin:
    """Main plugin class for Millennium"""
    
    def _front_end_loaded(self):
        """Called when frontend is loaded"""
        logger.log("Frontend loaded")
    
    def _load(self):
        """Plugin initialization"""
        logger.log(f"Plugin base dir: {PLUGIN_BASE_DIR}")
        
        # Create reviews directory
        reviews_dir = os.path.join(PLUGIN_BASE_DIR, "reviews")
        if not os.path.exists(reviews_dir):
            logger.log("Creating reviews directory...")
            os.makedirs(reviews_dir, exist_ok=True)
        logger.log(f"Reviews directory: {reviews_dir}")
        
        # Initialize global review manager
        global review_manager
        review_manager = ReviewManager(reviews_dir)
        
        # Load CSS and JavaScript files
        static_dir = os.path.join(PLUGIN_BASE_DIR, "static")
        
        css_path = os.path.join(static_dir, "review-writer.css")
        if os.path.exists(css_path):
            logger.log("Loading CSS file...")
            Millennium.add_browser_css("review-writer.css")
        else:
            logger.log("CSS file not found, skipping...")
        
        # Load JavaScript from .millennium/Dist/index.js
        js_path = os.path.join(PLUGIN_BASE_DIR, ".millennium", "Dist", "index.js")
        if os.path.exists(js_path):
            logger.log("Loading JavaScript file from .millennium/Dist/index.js...")
            Millennium.add_browser_js("index.js")
        else:
            logger.log("JavaScript file not found at .millennium/Dist/index.js, skipping...")
        
        logger.log("Backend loaded successfully")
        Millennium.ready()
    
    def _unload(self):
        """Plugin deinitialization"""
        logger.log("Unloading plugin")
        # Add cleanup logic here if necessary


if __name__ == "__main__":
    # Тестирование функций (только при прямом запуске)
    test_game_id = "123456"
    test_game_name = "Test Game"
    test_review = "Это тестовый обзор игры для проверки функциональности."
    
    print("Тестирование ReviewManager...")
    
    # Создаем временный менеджер для тестирования
    temp_manager = ReviewManager("test_reviews")
    
    # Сохранение обзора
    success = temp_manager.save_review(test_game_id, test_game_name, test_review)
    print(f"Сохранение обзора: {'Успешно' if success else 'Ошибка'}")
    
    # Проверка существования
    exists = temp_manager.has_review(test_game_id)
    print(f"Обзор существует: {exists}")
    
    # Загрузка обзора
    loaded_review = temp_manager.load_review(test_game_id)
    print(f"Загруженный обзор: {loaded_review}")
    
    # Получение всех обзоров
    all_reviews = temp_manager.get_all_reviews()
    print(f"Все обзоры: {all_reviews}")
    
    # Очистка тестовых файлов
    temp_manager.delete_review(test_game_id)
    print("Тестирование завершено")
