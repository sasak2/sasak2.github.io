---
title: 테스트 글 3 - 수식, 표, 마크다운 종합
date: 2026-10-26
tags: [메타]
summary: 행렬, 연립방정식, 표, 코드, 목록, 이미지 등이 전부 잘 보이는지 확인하는 종합 테스트 글이에요.
---

공개 전에 삭제할 테스트 글이에요.

## 1. 인라인 수식

밑첨자와 윗첨자: $a_1 + b_1 = c_{12}$, $x^2 + y^2 = r^2$, $e^{i\pi} + 1 = 0$.

분수와 근호: $\frac{a}{b}$, $\sqrt{x^2+1}$, $\sqrt[3]{27}=3$. 그리스 문자: $\alpha, \beta, \Omega, \mu\text{F}$.

밑줄이 여러 개 있어도 기울임으로 바뀌지 않아야 해요: $a_1 * b_2 * c_3$ 이고 일반 텍스트 snake_case_name 은 그대로예요.

## 2. 별도 줄 수식

$$
\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}
$$

한 줄로 쓴 별도 줄 수식:

$$ \lim_{n\to\infty}\left(1+\frac{1}{n}\right)^n = e $$

합과 곱:

$$
\sum_{k=1}^{n} k^2 = \frac{n(n+1)(2n+1)}{6}, \qquad \prod_{k=1}^{n} k = n!
$$

## 3. 행렬

괄호 행렬(pmatrix):

$$
A = \begin{pmatrix} 1 & 2 \\ 3 & 4 \end{pmatrix}
$$

대괄호 행렬(bmatrix)과 곱셈:

$$
\begin{bmatrix} 1 & 0 & 2 \\ -1 & 3 & 1 \end{bmatrix}
\begin{bmatrix} 3 & 1 \\ 2 & 1 \\ 1 & 0 \end{bmatrix}
=
\begin{bmatrix} 5 & 1 \\ 4 & 2 \end{bmatrix}
$$

행렬식(vmatrix)과 역행렬:

$$
\det A = \begin{vmatrix} 1 & 2 \\ 3 & 4 \end{vmatrix} = -2, \qquad
A^{-1} = \frac{1}{\det A}\begin{pmatrix} 4 & -2 \\ -3 & 1 \end{pmatrix}
$$

3x3 행렬식:

$$
\begin{vmatrix}
a & b & c \\
d & e & f \\
g & h & i
\end{vmatrix}
= a(ei - fh) - b(di - fg) + c(dh - eg)
$$

고유값 방정식:

$$
\det(A - \lambda I) = \begin{vmatrix} 1-\lambda & 2 \\ 3 & 4-\lambda \end{vmatrix} = \lambda^2 - 5\lambda - 2 = 0
$$

## 4. 연립방정식, 정렬, 경우 나누기

$$
\begin{aligned}
x + y &= 5 \\
2x - y &= 1
\end{aligned}
$$

$$
f(x) = \begin{cases}
x^2 & (x \ge 0) \\
-x & (x < 0)
\end{cases}
$$

## 5. 회로 수식

옴의 법칙과 RC 회로의 충전 전압:

$$
V_C(t) = V_s\left(1 - e^{-t/RC}\right), \qquad \tau = RC
$$

## 6. 표

| 항목 | 설명 | 예시 |
| :--- | :---: | ---: |
| 정렬 | 가운데 | 오른쪽 |
| 시간 복잡도 | $O(n \log n)$ | 퀵 정렬 |
| 행렬식 | $\lvert A \rvert$ | $\det A$ |
| 절댓값 | $|x|$ 처럼 세로선이 들어가도 | 표가 깨지지 않아야 해요 |
| 인라인 코드 | `printf("%d")` | 그대로 표시 |

## 7. 목록

1. 첫 번째
   - 하위 항목 A
   - 하위 항목 B ($x_i$ 수식 포함)
2. 두 번째
   1. 하위 번호 1
   2. 하위 번호 2

- [x] 완료한 일
- [ ] 아직 안 한 일

## 8. 글꼴 스타일과 링크

**굵게**, *기울임*, ~~취소선~~, `인라인 코드`, [GitHub](https://github.com/sasak2) 링크.

> 인용문 안에서도 수식 $E = mc^2$ 이 보이는지 확인해요.
>
> 두 번째 문단이에요.

---

## 9. 코드 블록

```python
def bfs(graph, start):
    from collections import deque
    dist = {start: 0}
    q = deque([start])
    while q:
        cur = q.popleft()
        for nxt in graph[cur]:
            if nxt not in dist:
                dist[nxt] = dist[cur] + 1
                q.append(nxt)
    return dist  # 아주 긴 줄이 가로로 스크롤되는지 확인: 0123456789012345678901234567890123456789012345678901234567890123456789
```

코드 안의 달러 기호는 수식으로 바뀌면 안 돼요:

```bash
echo "$HOME costs $5 and $10"
```

## 10. 이미지와 접기

![테스트 이미지](posts/img/test-diagram.svg)

<details>
<summary>눌러서 펼치기</summary>

접힌 안쪽 내용이에요. 수식도 되나요: $\sin^2\theta + \cos^2\theta = 1$

</details>

달러 기호가 돈일 때: \$5 와 \$10 은 수식이 아니에요.
