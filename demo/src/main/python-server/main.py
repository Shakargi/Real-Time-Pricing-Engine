import asyncio
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from confluent_kafka import Consumer, KafkaError
from concurrent.futures import ThreadPoolExecutor

app = FastAPI()

KAFKA_BROKER = 'localhost:9092'
TOPIC = 'pricing_results'
GROUP_ID = 'python-websocket-group'

active_connections = []

executor = ThreadPoolExecutor(max_workers=1)

main_loop = None 

async def submit_to_websockets(data: str):

    for connection in active_connections:
        await connection.send_text(data)

def kafka_poll_task():

    conf = {
        'bootstrap.servers': KAFKA_BROKER,
        'group.id': GROUP_ID,
        'auto.offset.reset': 'latest'
    }
    consumer = Consumer(conf)
    consumer.subscribe([TOPIC])
    
    print(f"[*] ThreadPool: Kafka Consumer listening on {TOPIC}...")

    try:
        while True:
            msg = consumer.poll(1.0) 
            
            if msg is None:
                continue
            if msg.error():
                if msg.error().code() != KafkaError._PARTITION_EOF:
                    print(f"Kafka Error: {msg.error()}")
                continue

            data = msg.value().decode('utf-8')
            

            if main_loop:
                asyncio.run_coroutine_threadsafe(submit_to_websockets(data), main_loop)

    except Exception as e:
        print(f"Error in Kafka Task: {e}")
    finally:
        consumer.close()

@app.on_event("startup")
async def startup_event():
    global main_loop
    main_loop = asyncio.get_running_loop()
    
    main_loop.run_in_executor(executor, kafka_poll_task)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    print(f"[+] WebSocket client connected! Total: {len(active_connections)}")
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        active_connections.remove(websocket)
        print(f"[-] WebSocket client disconnected. Total: {len(active_connections)}")