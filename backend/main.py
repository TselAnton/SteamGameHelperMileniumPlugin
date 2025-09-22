import Millennium, PluginUtils # type: ignore
logger = PluginUtils.Logger()

import json
import os

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
            result = json.dumps(reviews_db[str(app_id)], ensure_ascii=False)
            logger.log(f"Returning review data: {result}")
            return result
        logger.log("No review found, returning empty object")
        return json.dumps({}, ensure_ascii=False)

    @staticmethod
    def save_review(app_id, review_data):
        """Сохранить обзор игры"""
        logger.log(f"save_review() called for app {app_id}")
        try:
            data = json.loads(review_data)
            reviews_db[str(app_id)] = data
            save_reviews_db()
            return True
        except Exception as e:
            logger.log(f"Error saving review: {e}")
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
