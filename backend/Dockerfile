# Use official python image
FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Copy the project files
COPY pyproject.toml .
COPY main.py .
COPY routers/ routers/
COPY services/ services/
COPY data/ data/
COPY titanes.duckdb* .

# Install the project and its dependencies using standard pip
COPY requirements.txt .
RUN pip install --trusted-host pypi.org --trusted-host files.pythonhosted.org --no-cache-dir -r requirements.txt

# Start the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
