FROM python:3.12-slim

WORKDIR /app

COPY . /app

RUN chmod +x docker-entrypoint.sh

EXPOSE 9728

ENTRYPOINT ["./docker-entrypoint.sh"]
