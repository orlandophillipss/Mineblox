local Rules={}
function Rules.select(event,random)
	local total=0 for _,v in ipairs(event.variants) do total+=v.weight end
	if total<=0 then return nil end local at=random*total
	for _,v in ipairs(event.variants) do at-=v.weight if at<0 then return v end end
	return event.variants[#event.variants]
end
function Rules.expired(now,entry,position,ready,playing)
	-- PlaybackRegion supplies the audio-thread stop, independently of frames.
	-- Wall-time and playhead are secondary cleanup guards, not precise clipping.
	return not ready or not playing or position>=entry.finish or now>=entry.deadline
end
function Rules.speedChanged(now,entry,position,speed)
	if speed~=entry.speed then entry.speed=speed entry.deadline=now+math.max(0,entry.finish-position)/math.clamp(speed,.25,4)+.05 end
end
Rules.aliases={ui="ui.button.click",damage="entity.player.hurt",pickup="entity.item.pickup",step_stone="block.stone.step",step_grass="block.grass.step",step_wood="block.wood.step"}
return Rules
