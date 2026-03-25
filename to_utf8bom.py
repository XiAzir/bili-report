# -*- coding: utf-8 -*-
import os
import glob

dir_path = os.path.dirname(os.path.abspath(__file__))
csv_files = glob.glob(os.path.join(dir_path, '**', '*.csv'), recursive=True)

for file in csv_files:
    try:
        with open(file, 'rb') as f:
            raw = f.read()
        # 尝试解码（自动检测常见编码）
        for enc in ('utf-8-sig', 'utf-8', 'gbk', 'gb2312', 'gb18030'):
            try:
                text = raw.decode(enc)
                break
            except UnicodeDecodeError:
                continue
        else:
            print(f'[跳过] 无法识别编码: {file}')
            continue
        with open(file, 'w', encoding='utf-8-sig', newline='') as f:
            f.write(text)
        print(f'[完成] {os.path.relpath(file, dir_path)}')
    except Exception as e:
        print(f'[错误] {file}: {e}')

print(f'\n共处理 {len(csv_files)} 个文件')
