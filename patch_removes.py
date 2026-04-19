import re

filepath = r'f:\BOTS\nazuna\dados\src\index.js'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Adicionar alias 'ia', 'gpt', 'chatgpt' ao comando 'cog'
cog_replacement = r"""      case 'ia':
      case 'gpt':
      case 'chatgpt':
      case 'cog':"""
content = re.sub(r"      case 'cog':", cog_replacement, content, count=1)

# 2. Deletar impiedosamente os comandos fake que criei antes
cpf_pattern = r"(?s)\s+case 'cpf':\s+case 'vizinhos':\s+case 'proprietario':\s+case 'empregos':\s+case 'vacinas':\s+case 'beneficios':\s+case 'internet':\s+case 'parentes':\s+case 'enderecos':\s+case 'obito':\s+case 'score':\s+case 'compras':\s+case 'cnh':\s+reply\('⚠️ \*FUNÇÃO DESATIVADA\*.*?'\);\s+break;"
content = re.sub(cpf_pattern, "", content)

# Vou também confirmar se existia algum bloco inteiro antes
with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print("IA Aliases adicionadas e CPF removidos permanentemente")
