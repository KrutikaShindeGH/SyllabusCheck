from core.celery_app import celery_app

@celery_app.task
def generate_report(report_id: str):
    # Phase 7
    pass