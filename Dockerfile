FROM php:8.2-apache

ENV APACHE_DOCUMENT_ROOT=/var/www/html \
    PIP_BREAK_SYSTEM_PACKAGES=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    default-mysql-client \
    python3 \
    python3-pip \
    python3-requests \
    python3-numpy \
    curl \
    ca-certificates \
    && docker-php-ext-install pdo_mysql mysqli \
    && pip3 install --no-cache-dir nba_api \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN a2enmod headers rewrite

COPY docker/apache-courtstars.conf /etc/apache2/conf-available/courtstars.conf
RUN a2enconf courtstars

COPY . /var/www/html/courtstars
RUN chown -R www-data:www-data /var/www/html/courtstars

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://localhost/courtstars/api/test.php || exit 1


