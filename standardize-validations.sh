#!/bin/bash

# Script para padronizar as validações nos models

echo "Iniciando padronização dos models..."

# Lista de models que precisam de validações
models=(
  "AbandonedCheckout.ts"
  "AppReview.ts"
  "Commission.ts"
  "Coupon.ts"
  "Course.ts"
  "Customer.ts"
  "Lead.ts"
  "Order.ts"
  "PointsCoinsHistory.ts"
  "Product.ts"
  "UserCourseProgress.ts"
  "Voucher.ts"
)

for model in "${models[@]}"; do
  echo "Processando $model..."
  
  # Adicionar imports se não existirem
  if ! grep -q "validatePositiveNumber\|validatePercentage\|validateEmail\|validatePhone\|validateCPF" "/home/barone/apps/bdn-api/models/$model"; then
    # Detectar quais validações são necessárias
    validations=""
    
    if grep -q "min: \[0," "/home/barone/apps/bdn-api/models/$model"; then
      validations="validatePositiveNumber"
    fi
    
    if grep -q "max: \[100," "/home/barone/apps/bdn-api/models/$model"; then
      if [ -n "$validations" ]; then
        validations="$validations, validatePercentage"
      else
        validations="validatePercentage"
      fi
    fi
    
    if grep -q "validateEmail\|email" "/home/barone/apps/bdn-api/models/$model"; then
      if [ -n "$validations" ]; then
        validations="$validations, validateEmail"
      else
        validations="validateEmail"
      fi
    fi
    
    if grep -q "validatePhone\|phone" "/home/barone/apps/bdn-api/models/$model"; then
      if [ -n "$validations" ]; then
        validations="$validations, validatePhone"
      else
        validations="validatePhone"
      fi
    fi
    
    if [ -n "$validations" ]; then
      # Adicionar import após a primeira linha de import
      sed -i "/^import.*from 'mongoose';$/a import { $validations } from '../utils/validations';" "/home/barone/apps/bdn-api/models/$model"
    fi
  fi
  
  # Substituir min: [0, ...] por validatePositiveNumber
  sed -i 's/min: \[0, \(.*\)\]/validate: {\n        validator: validatePositiveNumber,\n        message: \1\n      }/g' "/home/barone/apps/bdn-api/models/$model"
  
  # Substituir max: [100, ...] por validatePercentage quando min também é 0
  sed -i '/min: \[0,.*\]/,/max: \[100,.*\]/ {
    s/max: \[100, \(.*\)\]/validate: {\n        validator: validatePercentage,\n        message: \1\n      }/g
  }' "/home/barone/apps/bdn-api/models/$model"
  
done

echo "Padronização concluída!"
