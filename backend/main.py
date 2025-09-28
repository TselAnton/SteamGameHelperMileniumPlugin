import Millennium, PluginUtils # type: ignore
logger = PluginUtils.Logger()

import json
import os
from datetime import datetime, timezone, timedelta
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

def get_current_timestamp():
    """Получить текущий timestamp в UTC+4"""
    # UTC+4 = UTC + 4 часа
    utc_plus_4 = timezone(timedelta(hours=4))
    return int(datetime.now(utc_plus_4).timestamp())

def format_timestamp_to_date(timestamp):
    """Преобразовать timestamp в читаемую дату"""
    if not timestamp:
        return None
    try:
        utc_plus_4 = timezone(timedelta(hours=4))
        dt = datetime.fromtimestamp(timestamp, tz=utc_plus_4)
        return dt.strftime("%Y-%m-%d")
    except Exception as e:
        logger.log(f"Error formatting timestamp {timestamp}: {e}")
        return None

def parse_date_to_timestamp(date_str):
    """Преобразовать дату в timestamp"""
    if not date_str:
        return None
    try:
        # Парсим дату в формате YYYY-MM-DD
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        # Устанавливаем UTC+4
        utc_plus_4 = timezone(timedelta(hours=4))
        dt = dt.replace(tzinfo=utc_plus_4)
        return int(dt.timestamp())
    except Exception as e:
        logger.log(f"Error parsing date {date_str}: {e}")
        return None

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
            data = reviews_db[str(app_id)].copy()  # Создаем копию для модификации
            
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
            
            # Преобразуем timestamps в читаемые даты для frontend
            if 'created_at' in data and data['created_at']:
                data['created_at_formatted'] = format_timestamp_to_date(data['created_at'])
                logger.log(f"Created date formatted: {data['created_at_formatted']}")
            
            if 'finished_at' in data and data['finished_at']:
                data['finished_at_formatted'] = format_timestamp_to_date(data['finished_at'])
                logger.log(f"Finished date formatted: {data['finished_at_formatted']}")
            
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
            
            # Проверяем, существует ли уже обзор для этой игры
            is_new_review = str(app_id) not in reviews_db
            logger.log(f"Is new review: {is_new_review}")
            
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
            
            # Логика дат
            current_time = get_current_timestamp()
            
            # Дата создания - только для новых обзоров
            if is_new_review:
                data['created_at'] = current_time
                logger.log(f"Set created_at: {current_time}")
            else:
                # Для существующих обзоров сохраняем старую дату создания
                if 'created_at' in reviews_db[str(app_id)]:
                    data['created_at'] = reviews_db[str(app_id)]['created_at']
                    logger.log(f"Preserved created_at: {data['created_at']}")
            
            # Дата прохождения - только если статус FINISHED
            if data.get('status') == 'FINISHED':
                if 'finished_at_formatted' in data and data['finished_at_formatted']:
                    # Пользователь указал дату
                    finished_timestamp = parse_date_to_timestamp(data['finished_at_formatted'])
                    if finished_timestamp:
                        data['finished_at'] = finished_timestamp
                        logger.log(f"Set finished_at from user input: {finished_timestamp}")
                    else:
                        # Если дата невалидна, используем текущую
                        data['finished_at'] = current_time
                        logger.log(f"Set finished_at to current time (invalid date): {current_time}")
                else:
                    # Пользователь не указал дату, используем текущую
                    data['finished_at'] = current_time
                    logger.log(f"Set finished_at to current time (no date): {current_time}")
            else:
                # Если статус не FINISHED, удаляем дату прохождения
                if 'finished_at' in data:
                    del data['finished_at']
                logger.log("Removed finished_at (status not FINISHED)")
            
            # Удаляем форматированные даты из данных для сохранения
            if 'created_at_formatted' in data:
                del data['created_at_formatted']
            if 'finished_at_formatted' in data:
                del data['finished_at_formatted']
            
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
