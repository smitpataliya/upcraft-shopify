pipeline {
    agent any

    environment {
        IMAGE_NAME = 'upcraft-shopify'
        IMAGE_TAG = 'latest'
        HOST_PORT = '4020'
        CONTAINER_NAME = 'upcraft-shopify'
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build Docker Image') {
            steps {
                sh 'docker build -t ${IMAGE_NAME}:${IMAGE_TAG} .'
            }
        }

        stage('Deploy Docker Container') {
            steps {
                sh '''
                    mkdir -p /var/data/upcraft-shopify
                    docker stop ${CONTAINER_NAME} || true
                    docker rm ${CONTAINER_NAME} || true
                    docker run -d \
                      --name ${CONTAINER_NAME} \
                      --restart unless-stopped \
                      --network upcraft-network \
                      -p 127.0.0.1:${HOST_PORT}:4000 \
                      -v /var/data/upcraft-shopify:/app/data \
                      -e NODE_ENV=production \
                      -e PORT=4000 \
                      -e HOST=0.0.0.0 \
                      -e CLIENT_ORIGIN=https://shopify.upcraft.tech \
                      -e SHOPIFY_STORE=b5nyri-eu.myshopify.com \
                      -e SHOPIFY_API_VERSION=2026-10 \
                      -e MOCK_MODE=false \
                      ${IMAGE_NAME}:${IMAGE_TAG}
                '''
            }
        }

        stage('Cleanup Old Images') {
            steps {
                sh 'docker image prune -f'
            }
        }
    }

    post {
        always {
            cleanWs()
        }
    }
}
