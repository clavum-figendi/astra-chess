"""Close every engine even if an earlier UCI quit fails."""
def close_engines(*engines):
    errors=[]
    for engine in engines:
        if engine is None:continue
        try:engine.quit()
        except Exception as error:errors.append(error)
        finally:
            try:engine.close()
            except Exception as error:errors.append(error)
    if errors:raise errors[0]
