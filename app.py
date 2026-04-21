from fastapi import FastAPI, Request
from pydantic import BaseModel
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
import duckdb

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")

templates = Jinja2Templates(directory="templates")

DB_PATH = "logs/application.log"

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse(
    request,
    "index.html",
    {"request": request}
    )

class QueryRequest(BaseModel):
    query: str

@app.post("/query")
async def run_query(payload: QueryRequest):
    query = payload.query
    
    
    print("Query recieved:", query)
    


    try:
        con = duckdb.connect()
        
        # Register JSON log file as a table
        con.execute(f"""
            CREATE OR REPLACE VIEW logs AS
            SELECT 
                CAST(timestamp AS timestamp) as timestamp,
                level,
                service,
                user_id,
                ip,
                incident,
                incident_service,
                incident_type,
                message,
                session_id
            FROM read_json_auto('{DB_PATH}')
        """)

        from fastapi.encoders import jsonable_encoder 
        import pandas as pd
        
        result = con.execute(query).fetchdf()
        
        # Replace NaN / NaT with None (JSON-safe null)
        result = result.where(pd.notnull(result), None)

        # Convert everything to string (optional but safe)
        #result = result.astype(str)
        
        # Normalize nulls
        result = result.where(pd.notnull(result), None)

        # Convert to plain Python objects (CRITICAL)
        rows = result.to_dict(orient="records")
        

        return {
            "columns": list(result.columns),
            "rows": [
                {k: str(v) for k, v in row.items()}
                for row in result.to_dict(orient="records")
    ]
}
        
        

    except Exception as e:
        import traceback
        traceback.print_exc()
        return JSONResponse({"error": str(e)}, status_code=400)