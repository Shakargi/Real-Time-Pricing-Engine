import asyncio
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from confluent_kafka import Consumer, KafkaError
from concurrent.futures import ThreadPoolExecutor

app = FastAPI()

KAFKA_BROKER = 'localhost:9092'
TOPICS = ['pricing_results', 'market_ticks']
GROUP_ID = 'python-websocket-group'

# 1. הפרדת הרשימות: רשימה נפרדת לכל סוג של מסך
live_market_connections = []
pricing_connections = []

executor = ThreadPoolExecutor(max_workers=1)
main_loop = None 

async def submit_to_websockets(data: str, topic: str):
    dead_connections = []
    
    # 2. החלטה לאן לשלוח את הנתונים לפי הנושא (Topic)
    target_connections = live_market_connections if topic == 'market_ticks' else pricing_connections
    
    for connection in target_connections:
        try:
            await connection.send_text(data)
        except Exception as e:
            print(f"[-] Failed to send to a client on {topic}: {e}")
            dead_connections.append(connection)
            
    # Cleanup dead connections
    for dead in dead_connections:
        if dead in target_connections:
            target_connections.remove(dead)
            print(f"[*] Cleaned up dead connection. Active on {topic}: {len(target_connections)}")

def kafka_poll_task():
    conf = {
        'bootstrap.servers': KAFKA_BROKER,
        'group.id': GROUP_ID,
        'auto.offset.reset': 'earliest'
    }
    consumer = Consumer(conf)
    consumer.subscribe(TOPICS)
    
    print(f"[*] ThreadPool: Kafka Consumer listening on {TOPICS}...")

    try:
        while True:
            msg = consumer.poll(1.0) 
            
            if msg is None:
                continue
            if msg.error():
                if msg.error().code() != KafkaError._PARTITION_EOF:
                    print(f"Kafka Error: {msg.error()}")
                continue

            # 3. חילוץ שם הנושא והמידע
            topic = msg.topic() 
            data = msg.value().decode('utf-8')

            print(f"[{topic.upper()}] {data}") 

            if main_loop:
                asyncio.run_coroutine_threadsafe(submit_to_websockets(data, topic), main_loop)

    except Exception as e:
        print(f"Error in Kafka Task: {e}")
    finally:
        consumer.close()

@app.on_event("startup")
async def startup_event():
    global main_loop
    main_loop = asyncio.get_running_loop()
    main_loop.run_in_executor(executor, kafka_poll_task)


# ==========================================
# 4. יצירת Endpoints ייעודיים לכל קומפוננטה
# ==========================================

@app.websocket("/ws/live")
async def websocket_live_endpoint(websocket: WebSocket):
    await websocket.accept()
    live_market_connections.append(websocket)
    print(f"[+] Live Market client connected! Total: {len(live_market_connections)}")
    try:
        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, Exception):
        if websocket in live_market_connections:
            live_market_connections.remove(websocket)
            print(f"[-] Live Market client disconnected. Total: {len(live_market_connections)}")

@app.websocket("/ws/pricing")
async def websocket_pricing_endpoint(websocket: WebSocket):
    await websocket.accept()
    pricing_connections.append(websocket)
    print(f"[+] Pricing (Monte Carlo) client connected! Total: {len(pricing_connections)}")
    try:
        while True:
            await websocket.receive_text()
    except (WebSocketDisconnect, Exception):
        if websocket in pricing_connections:
            pricing_connections.remove(websocket)
            print(f"[-] Pricing client disconnected. Total: {len(pricing_connections)}")