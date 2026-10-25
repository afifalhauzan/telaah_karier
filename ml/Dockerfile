# Build context is the repository root: the evaluation dataset is copied in so training can leave it out
FROM python:3.12-slim

WORKDIR /app
COPY ml/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY ml/pipeline.py ml/serve.py ./
COPY web/eval/dataset/dataset.csv ./eval_dataset.csv

EXPOSE 8100
CMD ["uvicorn", "serve:app", "--host", "0.0.0.0", "--port", "8100"]
