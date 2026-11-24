import uvicorn
from app.config import settings

if __name__ == "__main__":
    print(f"Portfolio online em: http://{settings.HOST}:{settings.PORT}")
    print(f"Painel Admin privado: http://{settings.HOST}:{settings.PORT}{settings.ADMIN_PATH}")
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=False,
    )
