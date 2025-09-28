import Millennium, PluginUtils # type: ignore
logger = PluginUtils.Logger()

import json
import os
from __main__ import PLUGIN_BASE_DIR

# База данных обзоров игр
reviews_db = {}

########
# UTIL #
########

def get_reviews_db_fname():
    """Получить путь к файлу базы данных обзоров"""
    return os.path.join(PLUGIN_BASE_DIR, "reviews_db.json")

def load_reviews_db():
    """Загрузить базу данных обзоров из файла"""
    global reviews_db
    if os.path.exists(get_reviews_db_fname()):
        try:
            with open(get_reviews_db_fname(), "rt", encoding="utf-8") as fp:
                reviews_db = json.load(fp)
        except Exception as e:
            logger.log(f"Error loading reviews database: {e}")
            reviews_db = {}

def save_reviews_db():
    """Сохранить базу данных обзоров в файл"""
    global reviews_db
    try:
        with open(get_reviews_db_fname(), "wt", encoding="utf-8") as fp:
            logger.log(f"Saving reviews database: {reviews_db}")
            json.dump(reviews_db, fp, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.log(f"Error saving reviews database: {e}")

##############
# INTERFACES #
##############

class Backend:
    @staticmethod
    def debug_log(message):
        """Метод для отладочного логирования из frontend"""
        logger.log(f"[DEBUG] {message}")
        return True

    @staticmethod
    def get_review(app_id):
        """Получить обзор игры по app_id"""
        logger.log(f"get_review() called for app {app_id}")
        if str(app_id) in reviews_db:
            data = reviews_db[str(app_id)]
            
            # Логируем исходные данные
            logger.log(f"Raw data from database: {data}")
            
            # Убеждаемся, что строки правильно кодированы в UTF-8
            if 'review' in data and data['review']:
                original_review = data['review']
                logger.log(f"Original review text: {repr(original_review)}")
                logger.log(f"Original review type: {type(original_review)}")
                
                # Попробуем разные способы кодирования
                try:
                    # Способ 1: Убеждаемся, что это UTF-8 строка
                    if isinstance(original_review, str):
                        # Кодируем в байты и декодируем обратно для проверки
                        encoded = original_review.encode('utf-8')
                        decoded = encoded.decode('utf-8')
                        logger.log(f"UTF-8 re-encoded review: {repr(decoded)}")
                        data['review'] = decoded
                    
                except Exception as e:
                    logger.log(f"Error re-encoding review text: {e}")
            
            result = json.dumps(data, ensure_ascii=False, separators=(',', ':'))
            logger.log(f"Final JSON result: {result}")
            logger.log(f"Final JSON result type: {type(result)}")
            return result
        logger.log("No review found, returning empty object")
        return json.dumps({}, ensure_ascii=False)

    @staticmethod
    def save_review(app_id, review_data):
        """Сохранить обзор игры"""
        logger.log(f"save_review() called for app {app_id}")
        logger.log(f"Raw review_data received: {repr(review_data)}")
        logger.log(f"Raw review_data type: {type(review_data)}")
        
        try:
            # Парсим JSON данные
            data = json.loads(review_data)
            logger.log(f"Parsed review data: {data}")
            
            # Проверяем и обрабатываем текст рецензии
            if 'review' in data and data['review']:
                original_text = data['review']
                logger.log(f"Original review text: {repr(original_text)}")
                
                # Убеждаемся, что текст правильно кодирован в UTF-8
                try:
                    if isinstance(original_text, str):
                        # Проверяем кодировку
                        encoded = original_text.encode('utf-8')
                        decoded = encoded.decode('utf-8')
                        data['review'] = decoded
                        logger.log(f"UTF-8 processed review text: {repr(decoded)}")
                except Exception as e:
                    logger.log(f"Error processing review text encoding: {e}")
            
            # Сохраняем в базу данных
            reviews_db[str(app_id)] = data
            save_reviews_db()
            logger.log("Review saved successfully to database")
            return True
        except Exception as e:
            logger.log(f"Error saving review: {e}")
            logger.log(f"Exception type: {type(e)}")
            return False

    @staticmethod
    def delete_review(app_id):
        """Удалить обзор игры"""
        logger.log(f"delete_review() called for app {app_id}")
        if str(app_id) in reviews_db:
            del reviews_db[str(app_id)]
            save_reviews_db()
            return True
        return False

    @staticmethod
    def get_all_reviews():
        """Получить все обзоры"""
        logger.log("get_all_reviews() called")
        return json.dumps(reviews_db, ensure_ascii=False)

class Plugin:
    def _front_end_loaded(self):
        logger.log("Frontend loaded")

    def _load(self):
        logger.log(f"Plugin base dir: {PLUGIN_BASE_DIR}")

        # Загружаем базу данных обзоров
        load_reviews_db()
        logger.log("Reviews database loaded")

        logger.log("Backend loaded")
        Millennium.ready()

    def _unload(self):
        # Сохраняем базу данных при выгрузке
        save_reviews_db()
        logger.log("Reviews database saved")
        logger.log("Unloading")
