import re

filepath = r'f:\BOTS\nazuna\dados\src\index.js'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Substituir o trecho do erro
search_str = """    let sender;
    
    
    
    

    
           })();
        }
      }
    } catch (e) {}

    if (isGroup) {"""

replace_str = """    let sender;

    if (isGroup) {"""

content = content.replace(search_str, replace_str)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
print("Resolvido syntax error localmente")
